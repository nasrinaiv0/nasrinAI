import { randomUUID } from 'node:crypto';

// Safe diagnostics for failed server initialization. The ID is useful even
// when platform logs are delayed or unavailable; never return exception text.
//
// For a configuration failure the reply also names the setting(s) at fault
// (for example ["CRON_SECRET"]), so the owner can fix it from a phone without
// platform logs. Only setting-name-shaped words are returned (capitals and
// underscores, like CRON_SECRET); never the message text, a value or a stack.
const SETTING_NAME = /\b(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|ROUTING)\b/g;
function settingNames(error) {
  const found = String(error?.message || '').match(SETTING_NAME) || [];
  return [...new Set(found)].filter((n) => n.length <= 48).slice(0, 5);
}

export function createStartupDiagnostic(stage, error, id = randomUUID()) {
  const normalizedStage = stage === 'loadConfig' ? 'configuration' : 'application';
  const settings = normalizedStage === 'configuration' ? settingNames(error) : [];
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
        stage: normalizedStage,
        ...(settings.length ? { settings } : {}),
        incident_id: id
      }
    }
  };
}
