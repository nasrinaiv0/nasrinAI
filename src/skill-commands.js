import CATALOG from '../config/skill-commands.json' with { type: 'json' };

// Skill slash commands (docs/features/universal-slash-commands.md). The list is
// generated from docs/NASRINAI_SKILLS.md and the Professional AI roles by
// scripts/build-skill-commands.js. A command only shapes the answer (a short
// system note, or the chosen professional); it never grants access to anything.

const BY_NAME = new Map(CATALOG.commands.map((c) => [c.command, Object.freeze(c)]));

export const skillCommandCount = () => BY_NAME.size;
export const skillCatalog = () => CATALOG;

// "/sql-query-optimization make this faster: ..." -> { command, rest }
export function resolveSkillCommand(text) {
  const m = /^\/([a-z0-9][a-z0-9-]{0,47})(?:\s+([\s\S]*))?$/i.exec(String(text || '').trim());
  if (!m) return null;
  const command = BY_NAME.get(m[1].toLowerCase());
  return command ? { ...command, rest: (m[2] || '').trim() } : null;
}

export function skillCommandPrompt(cmd) {
  if (!cmd || cmd.kind !== 'skill') return '';
  return '\n\nThe person used the slash command /' + cmd.command + ' (skill: ' + cmd.title + '; area: ' + cmd.group + '). '
    + 'Apply that skill directly to their request and the conversation context: do the task now with sensible defaults, '
    + 'keep the answer focused and concise, and ask only if a required input is missing.'
    + (cmd.rest ? '' : ' They gave no further text: briefly say what this skill does with one concrete example of how to use it.');
}
