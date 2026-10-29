import { redactForProvider } from './redact.js';

// Embeddings use 384 dimensions so tenant and public technical retrieval can
// share the same configured model contract without mixing their data scopes.
export const EMBEDDING_DIMENSIONS = 384;

export function createOpenAIEmbedder({ apiKey, model = 'text-embedding-3-small', fetchImpl = fetch, timeoutMs = 4000, baseUrl = 'https://api.openai.com/v1' }) {
  return {
    modelName: `openai/${model}@${EMBEDDING_DIMENSIONS}`,
    async embedMany(texts) {
      if (!Array.isArray(texts) || texts.length > 1000) throw new Error('embeddings input count is outside the supported range');
      if (!texts.length) return [];
      const input = texts.map((text) => redactForProvider(String(text)).slice(0, 2000));
      const resp = await fetchImpl(baseUrl + '/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, input: input.length === 1 ? input[0] : input, dimensions: EMBEDDING_DIMENSIONS }),
        signal: AbortSignal.timeout(input.length > 1 ? Math.max(timeoutMs, 15000) : timeoutMs),
        redirect: 'error'
      });
      if (!resp.ok) {
        // Classify structured provider errors internally; never log or expose the body.
        let quotaExhausted = false;
        if (resp.status === 429) {
          try {
            const payload = await resp.clone().json();
            const providerError = payload?.error;
            const code = String(providerError?.code || '').toLowerCase();
            const type = String(providerError?.type || '').toLowerCase();
            const message = String(providerError?.message || '').toLowerCase();
            quotaExhausted = code === 'insufficient_quota' || type === 'insufficient_quota'
              || /\b(?:quota|billing|credit balance)\b/.test(message);
          } catch {}
        }
        const error = new Error('embeddings answered ' + resp.status);
        error.status = resp.status;
        error.code = resp.status === 401 || resp.status === 403 ? 'embedding_auth_rejected'
          : resp.status === 429 && quotaExhausted ? 'embedding_quota_exhausted'
          : resp.status === 429 ? 'embedding_rate_limited'
          : resp.status >= 500 ? 'embedding_provider_unavailable'
          : 'embedding_provider_rejected';
        throw error;
      }
      const data = await resp.json();
      if (!Array.isArray(data?.data) || data.data.length !== input.length) throw new Error('embeddings returned an unexpected item count');
      const ordered = new Array(input.length);
      for (const [position, row] of data.data.entries()) {
        const index = Number.isInteger(row?.index) ? row.index : position;
        const vector = row?.embedding;
        if (index < 0 || index >= input.length || ordered[index]
          || !Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite)) {
          throw new Error('embeddings returned an unexpected shape');
        }
        ordered[index] = vector;
      }
      if (ordered.some((vector) => !vector)) throw new Error('embeddings returned incomplete results');
      return ordered;
    },
    async embed(text) {
      return (await this.embedMany([text]))[0];
    }
  };
}
