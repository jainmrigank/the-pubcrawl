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

