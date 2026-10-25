#!/usr/bin/env python3
"""Sync local OpenRouter generation CSVs from NasrinAI's existing Supabase telemetry.

This is an operator-run utility, not a Vercel runtime. Supabase remains the
durable source of generation IDs; OpenRouter /activity is aggregate analytics
and cannot supply generation_id values. Each known generation ID is reconciled
through GET /generation?id=... and upserted into the local daily CSV.

Required environment:
  SUPABASE_URL
  SUPABASE_SECRET_KEY
  OPENROUTER_API_KEY              inference key for GET /generation
  OPENROUTER_MANAGEMENT_KEY       management key for GET /activity
Optional:
  OPENROUTER_DATE=YYYY-MM-DD      defaults to UTC today
  OPENROUTER_LOG_DIR=./logs       output directory
  OPENROUTER_TIMEOUT=15           request timeout seconds
  OPENROUTER_PAGE_SIZE=500        Supabase page size, max 1000

Install:
  python -m pip install -r requirements-openrouter-sync.txt
Run:
  python scripts/openrouter_activity_sync.py

Privacy: this script never requests or stores prompt/completion bodies. It logs
only counts and safe error categories, never credentials or raw upstream bodies.
"""
from __future__ import annotations

import logging
import os
import re
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
SUPABASE_FIELDS = (
    "id,created_at,provider,upstream_provider,requested_model,model,"
    "prompt_tokens,cached_tokens,completion_tokens,total_tokens,total_cost_usd,"
    "finish_reason,generation_time_seconds,upstream_inference_time_seconds,"
    "latency_ms,provider_request_id,openrouter_generation_id,request_id,status,"
    "http_status,endpoint,provider_cost_source,provider_cost_reconciled_at"
)
OUTPUT_COLUMNS = [
    "generation_id", "created_at", "cost_total", "cost_web_search", "cost_cache",
    "cost_file_processing", "byok_usage_inference", "tokens_prompt",
    "tokens_completion", "tokens_reasoning", "tokens_cached", "model_permaslug",
    "provider_name", "variant", "cancelled", "streamed", "user", "finish_reason_raw",
    "finish_reason_normalized", "generation_time_ms", "time_to_first_token_ms",
    "app_name", "api_key_name", "api_key_disabled", "model_category",
    "is_unlisted_model",
]
ALIASES = {"openrouter/auto", "auto", "openrouter/auto-router"}


class SyncError(RuntimeError):
    pass


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value or "\n" in value or "\r" in value:
        raise SyncError(f"Required environment variable {name} is missing or invalid.")
    return value


def session() -> requests.Session:
    result = requests.Session()
    retry = Retry(
        total=3, connect=2, read=2, status=2, backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}), respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    result.mount("https://", adapter)
    result.headers.update({"Accept": "application/json", "User-Agent": "nasrinai-openrouter-csv-sync/1.0"})
    return result


def get_json(client: requests.Session, url: str, *, headers: dict[str, str],
             params: dict[str, Any] | None = None, timeout: int = 15) -> Any:
    try:
        response = client.get(url, headers=headers, params=params, timeout=timeout, allow_redirects=False)
    except requests.RequestException as exc:
        raise SyncError(f"Network failure ({type(exc).__name__}).") from None
    if response.status_code == 401:
        raise SyncError("OpenRouter rejected the configured credential (401). Check the key type and validity.")
    if response.status_code == 403:
        raise SyncError("OpenRouter denied access (403). Analytics requires a Management API key; generation detail requires an inference key.")
    if response.status_code >= 400:
        # Never print response.text: provider errors may contain sensitive data.
        raise SyncError(f"Upstream request failed with HTTP {response.status_code}.")
    try:
        return response.json()
    except ValueError:
        raise SyncError("Upstream returned invalid JSON.") from None


def fetch_catalog(client: requests.Session, timeout: int) -> set[str]:
    payload = get_json(client, f"{OPENROUTER_BASE}/models", headers={}, timeout=timeout)
    rows = payload.get("data", []) if isinstance(payload, dict) else []
    slugs = set()
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict):
            slug = row.get("id") or row.get("canonical_slug")
            if isinstance(slug, str) and slug.strip():
                slugs.add(slug.strip().lower())
    if not slugs:
        raise SyncError("The public OpenRouter catalog returned no recognizable model IDs.")
    return slugs


def classify_model(model: Any, catalog: set[str]) -> tuple[str, bool]:
    slug = str(model or "").strip()
    if not slug or slug.lower() in ALIASES:
        return "Unknown", False
    unlisted = slug.lower() not in catalog
    return ("Unlisted" if unlisted else "Catalog"), unlisted


def fetch_activity_summary(client: requests.Session, target: date, management_key: str,
                           timeout: int) -> int:
    """Call Management-key analytics for an independent aggregate cross-check."""
    payload = get_json(
        client, f"{OPENROUTER_BASE}/activity",
        headers={"Authorization": f"Bearer {management_key}"},
        params={"date": target.isoformat()}, timeout=timeout,
    )
    rows = payload.get("data", []) if isinstance(payload, dict) else []
    return len(rows) if isinstance(rows, list) else 0


def fetch_supabase_rows(client: requests.Session, base: str, secret: str, target: date,
                        timeout: int, page_size: int) -> list[dict[str, Any]]:
    start = datetime.combine(target, time.min, tzinfo=timezone.utc).isoformat()
    end = datetime.combine(target + timedelta(days=1), time.min, tzinfo=timezone.utc).isoformat()
    url = base.rstrip("/") + "/rest/v1/openrouter_logs"
    headers = {
        "apikey": secret, "Authorization": f"Bearer {secret}",
        "Accept": "application/json", "Range-Unit": "items",
    }
    result: list[dict[str, Any]] = []
    offset = 0
    while True:
        params = {
            "select": SUPABASE_FIELDS,
            "created_at": f"gte.{start}",
            "and": f"(created_at.lt.{end},provider.eq.openrouter)",
            "order": "created_at.asc",
            "limit": page_size,
            "offset": offset,
        }
        try:
            response = client.get(url, headers=headers, params=params, timeout=timeout, allow_redirects=False)
        except requests.RequestException as exc:
            raise SyncError(f"Supabase request failed ({type(exc).__name__}).") from None
        if response.status_code in (401, 403):
            raise SyncError(f"Supabase denied telemetry access (HTTP {response.status_code}); verify server-only credentials and grants.")
        if response.status_code >= 400:
            raise SyncError(f"Supabase telemetry query failed with HTTP {response.status_code}.")
        try:
            rows = response.json()
        except ValueError:
            raise SyncError("Supabase returned invalid telemetry JSON.") from None
        if not isinstance(rows, list):
            raise SyncError("Supabase telemetry response had an unexpected shape.")
        result.extend(row for row in rows if isinstance(row, dict))
        if len(rows) < page_size:
            break
        offset += len(rows)
    return result


def generation_id_for(row: dict[str, Any]) -> str:
    for field in ("openrouter_generation_id", "provider_request_id"):
        value = row.get(field)
        if isinstance(value, str) and re.fullmatch(r"gen-[0-9A-Za-z-]{1,120}", value.strip()):
            return value.strip()
    return ""


def normalize(row: dict[str, Any], generation: dict[str, Any], catalog: set[str]) -> dict[str, Any]:
    model = generation.get("model") if isinstance(generation.get("model"), str) else row.get("model")
    category, unlisted = classify_model(model, catalog)
    generation_time = generation.get("generation_time")
    ttft = generation.get("time_to_first_token")
    cost = generation.get("total_cost", generation.get("usage", row.get("total_cost_usd")))
    prompt = generation.get("tokens_prompt", generation.get("prompt_tokens", row.get("prompt_tokens")))
    completion = generation.get("tokens_completion", generation.get("completion_tokens", row.get("completion_tokens")))
    reasoning = generation.get("tokens_reasoning", row.get("reasoning_tokens"))
    cached = generation.get("tokens_cached", generation.get("native_tokens_cached", row.get("cached_tokens")))
    provider = generation.get("provider_name") or row.get("upstream_provider") or "OpenRouter"
    created = generation.get("created_at") or row.get("created_at")
    finish = generation.get("native_finish_reason") or generation.get("finish_reason") or row.get("finish_reason")
    return {
        "generation_id": generation.get("id") or row.get("openrouter_generation_id") or row.get("provider_request_id"),
        "created_at": created,
        "cost_total": cost,
        "cost_web_search": generation.get("web_search_cost"),
        "cost_cache": generation.get("cache_discount"),
        "cost_file_processing": generation.get("file_processing_cost"),
        "byok_usage_inference": generation.get("byok_usage_inference"),
        "tokens_prompt": prompt,
        "tokens_completion": completion,
        "tokens_reasoning": reasoning,
        "tokens_cached": cached,
        "model_permaslug": model,
        "provider_name": provider,
        "variant": generation.get("variant"),
        "cancelled": generation.get("cancelled"),
        "streamed": generation.get("streamed"),
        "user": generation.get("external_user"),
        "finish_reason_raw": generation.get("native_finish_reason") or finish,
        "finish_reason_normalized": finish,
        "generation_time_ms": float(generation_time) * 1000 if isinstance(generation_time, (int, float)) and generation_time >= 0 else None,
        "time_to_first_token_ms": float(ttft) * 1000 if isinstance(ttft, (int, float)) and ttft >= 0 else None,
        "app_name": generation.get("app_name"),
        "api_key_name": None,
        "api_key_disabled": None,
        "model_category": category,
        "is_unlisted_model": unlisted,
    }


def sync_csv(rows: list[dict[str, Any]], path: Path, catalog: set[str]) -> int:
    incoming = pd.DataFrame(rows)
    for column in OUTPUT_COLUMNS:
        if column not in incoming.columns:
            incoming[column] = pd.NA
    incoming = incoming[OUTPUT_COLUMNS]
    if path.exists():
        try:
            existing = pd.read_csv(path, dtype={"generation_id": "string", "model_permaslug": "string"})
        except (OSError, UnicodeError, pd.errors.ParserError) as exc:
            raise SyncError(f"Could not read existing CSV ({type(exc).__name__}); original file was not changed.") from None
        for column in OUTPUT_COLUMNS:
            if column not in existing.columns:
                existing[column] = pd.NA
        existing = existing[OUTPUT_COLUMNS]
        merged = pd.concat([existing, incoming], ignore_index=True)
    else:
        merged = incoming

    ids = merged["generation_id"].fillna("").astype(str).str.strip()
    has_id = ids.ne("")
    identified = merged.loc[has_id].copy()
    identified["generation_id"] = ids[has_id]
    identified = identified.drop_duplicates(subset=["generation_id"], keep="last")
    # Rows without generation IDs cannot be safely upserted. Keep pre-existing
    # unidentified rows but do not append new unidentified telemetry.
    unidentified = merged.loc[~has_id] if path.exists() else merged.iloc[0:0]
    merged = pd.concat([identified, unidentified], ignore_index=True)

    slugs = merged["model_permaslug"].fillna("").astype(str).str.strip()
    categories, flags = [], []
    for slug in slugs:
        category, unlisted = classify_model(slug, catalog)
        categories.append(category)
        flags.append(unlisted)
    merged["model_category"] = categories
    merged["is_unlisted_model"] = flags
    if "created_at" in merged:
        merged["_sort"] = pd.to_datetime(merged["created_at"], utc=True, errors="coerce")
        merged = merged.sort_values("_sort", kind="stable", na_position="last").drop(columns="_sort")
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    try:
        merged[OUTPUT_COLUMNS].to_csv(temp, index=False, encoding="utf-8")
        os.replace(temp, path)
    except Exception:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return len(merged)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        supabase_url = required_env("SUPABASE_URL")
        supabase_secret = required_env("SUPABASE_SECRET_KEY")
        inference_key = required_env("OPENROUTER_API_KEY")
        management_key = required_env("OPENROUTER_MANAGEMENT_KEY")
        target = date.fromisoformat(os.getenv("OPENROUTER_DATE", datetime.now(timezone.utc).date().isoformat()))
        output_dir = Path(os.getenv("OPENROUTER_LOG_DIR", "./logs")).expanduser()
        timeout = max(1, int(os.getenv("OPENROUTER_TIMEOUT", "15")))
        page_size = min(1000, max(1, int(os.getenv("OPENROUTER_PAGE_SIZE", "500"))))
        with session() as client:
            activity_count = fetch_activity_summary(client, target, management_key, timeout)
            catalog = fetch_catalog(client, timeout)
            source_rows = fetch_supabase_rows(client, supabase_url, supabase_secret, target, timeout, page_size)
            out_rows = []
            unavailable = 0
            for row in source_rows:
                gid = generation_id_for(row)
                if not gid:
                    unavailable += 1
                    continue
                try:
                    payload = get_json(
                        client, f"{OPENROUTER_BASE}/generation",
                        headers={"Authorization": f"Bearer {inference_key}"},
                        params={"id": gid}, timeout=timeout,
                    )
                    generation = payload.get("data", {}) if isinstance(payload, dict) else {}
                    if not isinstance(generation, dict) or not generation:
                        unavailable += 1
                        continue
                    out_rows.append(normalize(row, generation, catalog))
                except SyncError as exc:
                    # Permission errors are configuration failures; stop early.
                    if "401" in str(exc) or "403" in str(exc):
                        raise
                    unavailable += 1
            path = output_dir / f"openrouter_activity_{target.isoformat()}.csv"
            count = sync_csv(out_rows, path, catalog)
            logging.info("Sync complete: Supabase rows=%d, generation rows refreshed=%d, unavailable/skipped=%d.", len(source_rows), len(out_rows), unavailable)
            logging.info("OpenRouter aggregate activity rows=%d (analytics only; not merged as generation rows).", activity_count)
            logging.info("Catalog models=%d; CSV rows=%d; output=%s", len(catalog), count, path)
        return 0
    except (SyncError, ValueError) as exc:
        logging.error("%s", str(exc))
        return 1
    except OSError as exc:
        logging.error("Local file operation failed (%s).", type(exc).__name__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
