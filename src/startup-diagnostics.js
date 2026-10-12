import { randomUUID } from 'node:crypto';

// Safe diagnostics for failed server initialization. The ID is useful even
// when platform logs are delayed or unavailable; never return exception text.
export function createStartupDiagnostic(stage, error, id = randomUUID()) {
  const normalizedStage = stage === 'loadConfig' ? 'configuration' : 'application';
  return {
    id,
    stage: normalizedStage,
    log: {
      stage,
      startup_id: id,
      error: {
        name: String(error?.name || 'Error'),
        message: String(error?.message || error || 'unknown startup error').slice(0, 500)
      }
    },
    response: {
      error: {
        code: 'not_configured',
        message: 'NasrinAI is not set up correctly yet. Please try again later.',
        // Safe stage labels help diagnose startup failures when platform logs
        // are unavailable. Never return exception text or configuration values.
        stage: normalizedStage,
        incident_id: id
      }
    }
  };
}
