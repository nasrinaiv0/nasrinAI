import CATALOG from '../config/skill-commands.json' with { type: 'json' };
import IMAGE_EDITS from '../config/image-edit-commands.json' with { type: 'json' };

// Skill slash commands (docs/features/universal-slash-commands.md). The list is
// generated from docs/NASRINAI_SKILLS.md and the Professional AI roles by
// scripts/build-skill-commands.js. A command only shapes the answer (a short
// system note, or the chosen professional); it never grants access to anything.

const BY_NAME = new Map(CATALOG.commands.map((c) => [c.command, Object.freeze(c)]));

export const skillCommandCount = () => BY_NAME.size;
export const skillCatalog = () => CATALOG;
// Everything the composer's "/" menu offers: skill commands plus picture-editing
// commands (config/image-edit-commands.json). Picture edits run in the app
// through the image endpoint with the attached photo, never through chat.
const MENU = Object.freeze({ version: 1, commands: [...CATALOG.commands, ...IMAGE_EDITS.commands] });
export const commandMenu = () => MENU;
export const imageEditCount = () => IMAGE_EDITS.commands.length;

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
