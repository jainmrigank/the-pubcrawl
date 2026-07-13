/**
 * Durable store for public likes and kept (user-saved) drinks.
 *
 * Uses Upstash Redis over its REST API when KV_REST_API_URL + KV_REST_API_TOKEN
 * (or UPSTASH_REDIS_REST_URL/TOKEN) are set — so the data survives every
 * redeploy and restart. Falls back to local JSON files under data/ otherwise
 * (fine for local dev; on an ephemeral host those reset, which is exactly why
 * production should set the KV vars).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = (name) => join(ROOT, 'data', name);

const UP_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const UP_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const useKV = Boolean(UP_URL && UP_TOKEN);

async function kvCmd(args) {
  const res = await fetch(UP_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${UP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  return (await res.json()).result;
}

async function readBlob(key, file, fallback) {
  try {
    if (useKV) {
      const v = await kvCmd(['GET', key]);
      return v ? JSON.parse(v) : fallback;
    }
    if (existsSync(dataFile(file))) return JSON.parse(readFileSync(dataFile(file), 'utf8'));
  } catch (err) {
    console.error(`[store] read ${key}:`, err.message);
  }
  return fallback;
}

async function writeBlob(key, file, value) {
  try {
    if (useKV) {
      await kvCmd(['SET', key, JSON.stringify(value)]);
      return;
    }
    writeFileSync(dataFile(file), JSON.stringify(value, null, 1));
  } catch (err) {
    console.error(`[store] write ${key}:`, err.message);
  }
}

/* in-memory copies, loaded once and written through on change */
let likes = {};
let kept = [];

export async function initStore() {
  likes = await readBlob('pubcrawl:likes', 'likes.json', {});
  kept = await readBlob('pubcrawl:kept', 'kept_cocktails.json', []);
  console.log(`[store] ${useKV ? 'Upstash KV' : 'local file'} — ${Object.keys(likes).length} liked, ${kept.length} kept`);
}

export const storeMode = () => (useKV ? 'kv' : 'file');
export const getLikes = () => likes;
export const getKept = () => kept;

export function saveLikes(next) {
  likes = next;
  writeBlob('pubcrawl:likes', 'likes.json', likes);
}

export function addKept(drink) {
  if (!kept.some((d) => d.id === drink.id)) {
    kept = [...kept, drink];
    writeBlob('pubcrawl:kept', 'kept_cocktails.json', kept);
  }
  return drink;
}
