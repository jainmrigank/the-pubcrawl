/** Runtime-neutral Upstash REST persistence for the Cloudflare Worker. */

const memory = new Map();
const memoryExpiry = new Map();

export const STORE_KEYS = Object.freeze({
  likes: 'pubcrawl:likes',
  kept: 'pubcrawl:kept',
  subs: 'pubcrawl:subs',
  high: 'pubcrawl:highscore',
  hall: 'pubcrawl:hall',
  videoStats: 'pubcrawl:videostats',
  shortMetrics: 'pubcrawl:shortmetrics',
  watchMetrics: 'pubcrawl:watchmetrics',
});

export function storeConfigured(env) {
  return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
}

export async function command(env, args) {
  if (!storeConfigured(env)) throw new Error('Upstash is not configured');
  const response = await fetch(env.KV_REST_API_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.KV_REST_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`Upstash request failed (${response.status})`);
  const payload = await response.json();
  return payload.result;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function memoryValue(key, fallback) {
  const expiry = memoryExpiry.get(key) || 0;
  if (expiry && expiry <= Date.now()) {
    memory.delete(key);
    memoryExpiry.delete(key);
  }
  if (!memory.has(key)) memory.set(key, clone(fallback));
  return memory.get(key);
}

export async function readJson(env, key, fallback) {
  if (!storeConfigured(env)) return clone(memoryValue(key, fallback));
  const raw = await command(env, ['GET', key]);
  return raw ? JSON.parse(raw) : clone(fallback);
}

export async function writeJson(env, key, value) {
  if (!storeConfigured(env)) {
    memory.set(key, clone(value));
    return clone(value);
  }
  await command(env, ['SET', key, JSON.stringify(value)]);
  return value;
}

/** Create a JSON value once, with a bounded lifetime. */
export async function createJsonIfAbsent(env, key, value, ttlSeconds) {
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 1));
  if (!storeConfigured(env)) {
    const now = Date.now();
    const expiry = memoryExpiry.get(key) || 0;
    if (expiry > now && memory.has(key)) return false;
    memory.set(key, clone(value));
    memoryExpiry.set(key, now + ttl * 1000);
    return true;
  }
  const result = await command(env, ['SET', key, JSON.stringify(value), 'NX', 'EX', String(ttl)]);
  return result === 'OK';
}

/** Store JSON with expiry without exposing provider-specific commands above the store. */
export async function writeJsonWithExpiry(env, key, value, ttlSeconds) {
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 1));
  if (!storeConfigured(env)) {
    memory.set(key, clone(value));
    memoryExpiry.set(key, Date.now() + ttl * 1000);
    return value;
  }
  await command(env, ['SET', key, JSON.stringify(value), 'EX', String(ttl)]);
  return value;
}

/**
 * Atomically claim either the first delivery attempt or the explicitly queued
 * successor to a retryable attempt. This prevents duplicate Queue messages
 * from making the same external submission.
 */
export async function claimDeliveryAttemptAtomic(env, key, attempt, value, ttlSeconds) {
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 1));
  const expectedAttempt = Math.max(0, Math.floor(Number(attempt) || 0));
  if (!storeConfigured(env)) {
    const current = memory.get(key);
    const canClaim = !current
      ? expectedAttempt === 0
      : current.status === 'retryable' && Number(current.nextAttempt) === expectedAttempt;
    if (!canClaim) return false;
    memory.set(key, clone(value));
    memoryExpiry.set(key, Date.now() + ttl * 1000);
    return true;
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local attempt=tonumber(ARGV[1]); if not raw then if attempt~=0 then return 0 end else local current=cjson.decode(raw); if current.status~='retryable' or tonumber(current.nextAttempt)~=attempt then return 0 end end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1";
  return Number(await command(env, ['EVAL', script, 1, key, String(expectedAttempt), JSON.stringify(value), String(ttl)])) === 1;
}

/**
 * Resolve a delivery left in `submitting` after the runtime disappeared.
 * The caller chooses a cutoff longer than the outbound request timeout, so a
 * genuinely active submission is never relabelled while it can still finish.
 */
export async function markStaleSubmissionUncertainAtomic(env, key, attempt, staleBefore, value, ttlSeconds) {
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 1));
  const expectedAttempt = Math.max(0, Math.floor(Number(attempt) || 0));
  const cutoff = Number(staleBefore);
  if (!storeConfigured(env)) {
    const current = memoryValue(key, null);
    const canResolve = current?.status === 'submitting'
      && Number(current.attempt) === expectedAttempt
      && Number(current.startedAt) <= cutoff;
    if (!canResolve) return false;
    memory.set(key, clone(value));
    memoryExpiry.set(key, Date.now() + ttl * 1000);
    return true;
  }
  const script = "local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local current=cjson.decode(raw); if current.status~='submitting' or tonumber(current.attempt)~=tonumber(ARGV[1]) or tonumber(current.startedAt)>tonumber(ARGV[2]) then return 0 end; redis.call('SET',KEYS[1],ARGV[3],'EX',ARGV[4]); return 1";
  return Number(await command(env, ['EVAL', script, 1, key, String(expectedAttempt), String(cutoff), JSON.stringify(value), String(ttl)])) === 1;
}

/** Merge campaign progress/counters without replacing a concurrently updated record. */
export async function updateCampaignAtomic(env, key, patch = {}, increments = {}, ttlSeconds = 2592000) {
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 1));
  if (!storeConfigured(env)) {
    const current = memoryValue(key, {});
    for (const [name, value] of Object.entries(patch)) {
      if (name === 'publishedCount') current[name] = Math.max(Number(current[name] || 0), Number(value || 0));
      else if (name === 'firstProviderAcceptance' || name === 'configurationFailedAt') {
        const before = Number(current[name]);
        const proposed = Number(value);
        if (current[name] == null || !Number.isFinite(before) || (Number.isFinite(proposed) && proposed < before)) current[name] = proposed;
      }
      else if (name === 'lastProviderAcceptance') {
        const before = Number(current[name]);
        const proposed = Number(value);
        if (current[name] == null || !Number.isFinite(before) || (Number.isFinite(proposed) && proposed > before)) current[name] = proposed;
      }
      else current[name] = clone(value);
    }
    for (const [name, value] of Object.entries(increments)) current[name] = Number(current[name] || 0) + Number(value || 0);
    memoryExpiry.set(key, Date.now() + ttl * 1000);
    return clone(current);
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local v={}; if raw then v=cjson.decode(raw) end; local patch=cjson.decode(ARGV[1]); for k,x in pairs(patch) do if k=='publishedCount' then v[k]=math.max(tonumber(v[k]) or 0,tonumber(x) or 0) elseif k=='firstProviderAcceptance' or k=='configurationFailedAt' then local before=tonumber(v[k]); local proposed=tonumber(x); if v[k]==nil or not before or (proposed and proposed<before) then v[k]=proposed end elseif k=='lastProviderAcceptance' then local before=tonumber(v[k]); local proposed=tonumber(x); if v[k]==nil or not before or (proposed and proposed>before) then v[k]=proposed end else v[k]=x end end; local inc=cjson.decode(ARGV[2]); for k,x in pairs(inc) do v[k]=(tonumber(v[k]) or 0)+(tonumber(x) or 0) end; redis.call('SET',KEYS[1],cjson.encode(v),'EX',ARGV[3]); return cjson.encode(v)";
  return JSON.parse(await command(env, ['EVAL', script, 1, key, JSON.stringify(patch), JSON.stringify(increments), String(ttl)]));
}

export async function updateLikeAtomic(env, key, id, delta) {
  const amount = Number(delta) < 0 ? -1 : 1;
  if (!storeConfigured(env)) {
    const values = memoryValue(key, {});
    const next = Math.max(0, Number(values[id] || 0) + amount);
    if (next) values[id] = next; else delete values[id];
    return next;
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local v={}; if raw then v=cjson.decode(raw) end; local id=ARGV[1]; local n=(tonumber(v[id]) or 0)+tonumber(ARGV[2]); if n<0 then n=0 end; if n==0 then v[id]=nil else v[id]=n end; redis.call('SET',KEYS[1],cjson.encode(v)); return n";
  return Number(await command(env, ['EVAL', script, 1, key, id, String(amount)])) || 0;
}

export async function appendUniqueAtomic(env, key, item, cap = 1000) {
  if (!storeConfigured(env)) {
    const list = memoryValue(key, []);
    const existing = list.find((entry) => entry?.id === item.id);
    if (existing) return clone(existing);
    list.push(clone(item));
    if (list.length > cap) list.splice(0, list.length - cap);
    return clone(item);
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local v={}; if raw then v=cjson.decode(raw) end; local item=cjson.decode(ARGV[1]); for i=1,#v do if v[i].id==item.id then return cjson.encode(v[i]) end end; table.insert(v,item); local cap=tonumber(ARGV[2]); while #v>cap do table.remove(v,1) end; redis.call('SET',KEYS[1],cjson.encode(v)); return cjson.encode(item)";
  return JSON.parse(await command(env, ['EVAL', script, 1, key, JSON.stringify(item), String(cap)]));
}

export async function updateHighScoreAtomic(env, key, score, at) {
  if (!storeConfigured(env)) {
    const current = memoryValue(key, { score: 0, at: 0 });
    const beaten = score > Number(current.score || 0);
    if (beaten) memory.set(key, { score, at });
    return { ...(beaten ? { score, at } : current), beaten };
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local v={score=0,at=0}; if raw then v=cjson.decode(raw) end; local score=tonumber(ARGV[1]); local beaten=score>(tonumber(v.score) or 0); if beaten then v={score=score,at=tonumber(ARGV[2])}; redis.call('SET',KEYS[1],cjson.encode(v)) end; v.beaten=beaten; return cjson.encode(v)";
  return JSON.parse(await command(env, ['EVAL', script, 1, key, String(score), String(at)]));
}

export async function prependCappedAtomic(env, key, entry, cap = 50) {
  if (!storeConfigured(env)) {
    const list = memoryValue(key, []);
    list.unshift(clone(entry));
    list.splice(cap);
    return clone(list);
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local v={}; if raw then v=cjson.decode(raw) end; table.insert(v,1,cjson.decode(ARGV[1])); local cap=tonumber(ARGV[2]); while #v>cap do table.remove(v) end; redis.call('SET',KEYS[1],cjson.encode(v)); return cjson.encode(v)";
  return JSON.parse(await command(env, ['EVAL', script, 1, key, JSON.stringify(entry), String(cap)]));
}

export async function incrementCountersAtomic(env, key, defaults, increments) {
  if (!storeConfigured(env)) {
    const current = memoryValue(key, defaults);
    for (const [name, value] of Object.entries(increments)) current[name] = Number(current[name] || 0) + Number(value || 0);
    return clone(current);
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local v=cjson.decode(ARGV[1]); if raw then v=cjson.decode(raw) end; local d=cjson.decode(ARGV[2]); for k,n in pairs(d) do v[k]=(tonumber(v[k]) or 0)+(tonumber(n) or 0) end; redis.call('SET',KEYS[1],cjson.encode(v)); return cjson.encode(v)";
  return JSON.parse(await command(env, ['EVAL', script, 1, key, JSON.stringify(defaults), JSON.stringify(increments)]));
}

export async function upsertSubscriptionAtomic(env, key, subscription, now, cap = 500) {
  const record = { sub: subscription, createdAt: now, lastSeen: now };
  if (!storeConfigured(env)) {
    const list = memoryValue(key, []);
    const existing = list.find((item) => item?.sub?.endpoint === subscription.endpoint);
    if (existing) {
      existing.lastSeen = now;
      existing.sub = clone(subscription);
      return false;
    }
    list.push(clone(record));
    if (list.length > cap) list.splice(0, list.length - cap);
    return true;
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local v={}; if raw then v=cjson.decode(raw) end; local item=cjson.decode(ARGV[1]); for i=1,#v do if v[i].sub.endpoint==item.sub.endpoint then v[i].sub=item.sub; v[i].lastSeen=item.lastSeen; redis.call('SET',KEYS[1],cjson.encode(v)); return 0 end end; table.insert(v,item); local cap=tonumber(ARGV[2]); while #v>cap do table.remove(v,1) end; redis.call('SET',KEYS[1],cjson.encode(v)); return 1";
  return Number(await command(env, ['EVAL', script, 1, key, JSON.stringify(record), String(cap)])) === 1;
}

export async function removeSubscriptionAtomic(env, key, endpoint) {
  if (!storeConfigured(env)) {
    const list = memoryValue(key, []);
    memory.set(key, list.filter((item) => item?.sub?.endpoint !== endpoint));
    return;
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local v={}; if raw then v=cjson.decode(raw) end; local next={}; for i=1,#v do if v[i].sub.endpoint~=ARGV[1] then table.insert(next,v[i]) end end; redis.call('SET',KEYS[1],cjson.encode(next)); return #next";
  await command(env, ['EVAL', script, 1, key, endpoint]);
}

export async function touchSubscriptionAtomic(env, key, endpoint, now) {
  if (!storeConfigured(env)) {
    const list = memoryValue(key, []);
    const item = list.find((entry) => entry?.sub?.endpoint === endpoint);
    if (item) item.lastSeen = now;
    return;
  }
  const script = "local raw=redis.call('GET',KEYS[1]); local v={}; if raw then v=cjson.decode(raw) end; for i=1,#v do if v[i].sub.endpoint==ARGV[1] then v[i].lastSeen=tonumber(ARGV[2]) end end; redis.call('SET',KEYS[1],cjson.encode(v)); return 1";
  await command(env, ['EVAL', script, 1, key, endpoint, String(now)]);
}

export async function consumeWindowCounter(env, key, ttlSeconds) {
  if (!storeConfigured(env)) {
    const now = Date.now();
    const expiry = memoryExpiry.get(key) || 0;
    if (expiry <= now) {
      memory.set(key, 1);
      memoryExpiry.set(key, now + ttlSeconds * 1000);
      return 1;
    }
    const next = Number(memory.get(key) || 0) + 1;
    memory.set(key, next);
    return next;
  }
  const script = 'local n=redis.call("INCR",KEYS[1]); if n==1 then redis.call("EXPIRE",KEYS[1],ARGV[1]) end; return n';
  return Number(await command(env, ['EVAL', script, 1, key, String(ttlSeconds)])) || 0;
}
