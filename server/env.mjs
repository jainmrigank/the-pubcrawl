/**
 * Loads .env into process.env before anything else reads it.
 * Import this FIRST in the server entry points — the store and the push keys
 * both read process.env at module load, so it has to win the race.
 * Real environment variables (Render, CI) always take precedence.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const path of [join(ROOT, '.env'), join(ROOT, '..', '.env')]) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}
