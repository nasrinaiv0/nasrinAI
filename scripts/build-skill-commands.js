#!/usr/bin/env node
// Builds config/skill-commands.json: one unique slash command per skill in
// docs/NASRINAI_SKILLS.md and one /as-<profession> per Professional AI role.
// Run after editing the skills list:  node scripts/build-skill-commands.js
import { readFileSync, writeFileSync } from 'node:fs';
import { PROFESSIONS } from '../src/ai/professions.js';

const root = new URL('../', import.meta.url);
// Core commands handled by the app itself (public/creative-intent.js); skills never take these names.
const RESERVED = new Set(['clone', 'blur', 'remove-background', 'upscale', 'image', 'video', 'rewrite', 'translate', 'summarize', 'shorten', 'expand', 'proofread', 'explain', 'debug', 'review', 'research', 'compare', 'plan', 'brainstorm', 'email', 'code', 'analyze', 'automate', 'search', 'browse', 'remember', 'recall', 'library', 'file', 'document', 'connect']);

export const slug = (text) => String(text).toLowerCase()
  .replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/#/g, ' sharp ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');

export function buildSkillCommands(markdown) {
  const commands = [];
  const taken = new Set(RESERVED);
  let group = '';
  for (const line of markdown.split('\n')) {
    if (/^##\s/.test(line)) { group = ''; continue; }
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) { group = heading[1].trim(); continue; }
    const bullet = /^-\s+(.+?)\s*$/.exec(line);
    if (!bullet || !group) continue;
    const title = bullet[1].replace(/\*\*/g, '').trim();
    if (title.length < 3 || title.length > 120) continue;
    let name = slug(title);
    if (!name) continue;
    if (taken.has(name)) name = slug(title + ' ' + group.split(/\s+/)[0]);
    if (taken.has(name)) continue;
    taken.add(name);
    commands.push({ command: name, title, group, kind: 'skill' });
  }
  for (const p of PROFESSIONS) {
    const name = 'as-' + p.id.replace(/_/g, '-');
    if (taken.has(name)) continue;
    taken.add(name);
    commands.push({ command: name, title: 'Answer as ' + p.name, group: 'Professional AI', kind: 'profession', id: p.id });
  }
  return commands;
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const commands = buildSkillCommands(readFileSync(new URL('docs/NASRINAI_SKILLS.md', root), 'utf8'));
  writeFileSync(new URL('config/skill-commands.json', root), JSON.stringify({ version: 1, commands }) + '\n');
  console.log('wrote ' + commands.length + ' commands');
}
