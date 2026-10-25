-- Phase 3 performance hardening: index foreign-key columns flagged by the live advisor.
-- Keep each index narrow and idempotent; do not remove unused indexes based on a short
-- observation window because those may serve infrequent security, cleanup, or admin paths.
begin;

create index if not exists ncc_activities_contact_id_idx
  on public.ncc_activities (contact_id);

create index if not exists ncc_outbox_automation_id_idx
  on public.ncc_outbox (automation_id);

create index if not exists ncc_outbox_channel_id_idx
  on public.ncc_outbox (channel_id);

create index if not exists ncc_outbox_contact_id_idx
  on public.ncc_outbox (contact_id);

create index if not exists ncc_tasks_contact_id_idx
  on public.ncc_tasks (contact_id);

create index if not exists ncc_tasks_deal_id_idx
  on public.ncc_tasks (deal_id);

create index if not exists video_studio_audio_assets_project_id_fk_idx
  on public.video_studio_audio_assets (project_id);

create index if not exists video_studio_timeline_items_audio_asset_id_fk_idx
  on public.video_studio_timeline_items (audio_asset_id);

commit;
