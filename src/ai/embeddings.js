import { redactForProvider } from './redact.js';

// Embeddings for the semantic cache through OpenAI's embeddings endpoint, with
// plain fetch (no packages; ADR-002). text-embedding-3 models accept
// `dimensions`, so the vectors fit the cache's vector(384) column. Contact
// details are removed before the text leaves the server, as for chat.
export const EMBEDDING_DIMENSIONS = 384;

export function createOpenAIEmbedder({ apiKey, model = 'text-embedding-3-small', fetchImpl = fetch, timeoutMs = 4000, baseUrl = 'https://api.openai.com/v1' }) {
  return {
    // Stored with each row: rows from another model or size are never matched.
    modelName: `openai/${model}@${EMBEDDING_DIMENSIONS}`,
    async embed(text) {
      const resp = await fetchImpl(baseUrl + '/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, input: redactForProvider(String(text)).slice(0, 2000), dimensions: EMBEDDING_DIMENSIONS }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!resp.ok) throw new Error(`embeddings answered ${resp.status}`);
      const data = await resp.json();
      const vector = data?.data?.[0]?.embedding;
      if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite)) {
        throw new Error('embeddings returned an unexpected shape');
      }
      return vector;
    }
  };
}
