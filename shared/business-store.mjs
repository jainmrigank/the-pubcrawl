import { command, storeConfigured } from '../worker/store.mjs';

const prefix = 'pubcrawl:{business}:v1:';
const metricLifetime = 120 * 86400;
const trackLifetime = 36 * 3600;

const writeRecord = `
local current=redis.call('GET',KEYS[1])
if current and ARGV[3]=='once' then return 0 end
if current and ARGV[3]=='newer' and tonumber(cjson.decode(current).updatedAt)>=tonumber(ARGV[4]) then return 0 end
redis.call('SET',KEYS[1],ARGV[1])
if tonumber(ARGV[2])>0 then redis.call('EXPIRE',KEYS[1],ARGV[2]) end
if ARGV[5]~='' then redis.call('ZADD',KEYS[2],ARGV[4],ARGV[5]) end
for index=3,#KEYS do
  local offset=6+(index-3)*2
  redis.call('HINCRBY',KEYS[index],ARGV[offset],ARGV[offset+1])
  redis.call('EXPIRE',KEYS[index],${metricLifetime})
end
return 1
`;

const trackEvent = `
local mapping={}
local added=redis.call('SET',KEYS[2],'1','NX','EX',${trackLifetime})
if added then
  mapping[#mapping+1]=ARGV[1]
  mapping[#mapping+1]=ARGV[2]
end
if ARGV[3]~='' and redis.call('SET',KEYS[3],'1','NX','EX',${trackLifetime}) then mapping[#mapping+1]=ARGV[3] end
mapping[#mapping+1]=ARGV[4]
for i=1,#mapping do
  if redis.call('HLEN',KEYS[1])<4000 or redis.call('HEXISTS',KEYS[1],mapping[i])==1 then
    redis.call('HINCRBY',KEYS[1],mapping[i],1)
  end
end
redis.call('EXPIRE',KEYS[1],${metricLifetime})
return 1
`;

export const istDay = (time = Date.now()) => new Date(time + 19800000).toISOString().slice(0, 10);
export const metricField = (event, path, source, campaign = {}, detail = '') =>
  JSON.stringify([event, path, source, campaign.utm_campaign || '', campaign.utm_content || '', detail, campaign.utm_medium || '']);
export const metric = (day, field, value = 1) => ({ day, field, value });

const recordKey = (kind, id) => prefix + kind + ':' + id;
const indexKey = kind => prefix + 'index:' + kind;
const metricsKey = day => prefix + 'metrics:' + day;

export function createBusinessStore(env, useMemory = false) {
  const settings = {
    KV_REST_API_URL: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL,
    KV_REST_API_TOKEN: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN,
  };
  const live = !useMemory && storeConfigured(settings);
  const redis = args => command(settings, args);
  const records = new Map();
  const indexes = new Map();
  const counters = new Map();

  function memoryGet(key) {
    const row = records.get(key);
    if (row?.expires && row.expires < Date.now()) {
      records.delete(key);
      return null;
    }
    return row?.value ?? null;
  }
  function memoryWrite(key, value, ttl) {
    records.set(key, { value, expires: ttl > 0 ? Date.now() + ttl * 1000 : 0 });
  }
  function memoryAdd(day, field, value) {
    if (!counters.has(day)) counters.set(day, new Map());
    const dayCounters = counters.get(day);
    dayCounters.set(field, (dayCounters.get(field) || 0) + value);
  }

  return {
    available: live || useMemory,
    async get(kind, id) {
      if (!live) return memoryGet(recordKey(kind, id));
      const value = await redis(['GET', recordKey(kind, id)]);
      return value ? JSON.parse(value) : null;
    },
    async write(kind, id, value, { ttl = 0, mode = '', index = false, time = Date.now(), deltas = [] } = {}) {
      const key = recordKey(kind, id);
      if (live) {
        return Number(await redis(['EVAL', writeRecord, 2 + deltas.length,
          key, indexKey(kind), ...deltas.map(delta => metricsKey(delta.day)),
          JSON.stringify(value), ttl, mode, time, index ? id : '',
          ...deltas.flatMap(delta => [delta.field, delta.value]),
        ])) === 1;
      }
      const current = memoryGet(key);
      if (current !== null && (mode === 'once' || (mode === 'newer' && current.updatedAt >= time))) return false;
      memoryWrite(key, value, ttl);
      if (index) {
        if (!indexes.has(kind)) indexes.set(kind, new Map());
        indexes.get(kind).set(id, time);
      }
      for (const delta of deltas) memoryAdd(delta.day, delta.field, delta.value);
      return true;
    },
    async list(kind, limit = 60, offset = 0) {
      if (!live) {
        const ids = [...(indexes.get(kind) ?? [])].sort((a, b) => b[1] - a[1]);
        return ids.slice(offset, offset + limit).map(([id]) => memoryGet(recordKey(kind, id))).filter(Boolean);
      }
      // Remove old pointers in the same commands used for reading. Newsletter
      // records are retained according to consent rather than a fixed lead TTL.
      if (kind === 'lead') await redis(['ZREMRANGEBYSCORE', indexKey(kind), '-inf', Date.now() - 180 * 86400000]);
      const ids = await redis(['ZREVRANGE', indexKey(kind), offset, offset + limit - 1]);
      if (!ids.length) return [];
      const rows = await redis(['MGET', ...ids.map(id => recordKey(kind, id))]);
      return rows.filter(Boolean).map(JSON.parse);
    },
    async recordTrack(day, visitHash, fields) {
      const visitKey = recordKey('visit', day + ':' + visitHash);
      const engagementKey = recordKey('engaged', day + ':' + visitHash);
      if (live) {
        await redis(['EVAL', trackEvent, 3, metricsKey(day), visitKey, engagementKey, fields.visit, fields.entry, fields.engaged, fields.action]);
        return;
      }
      if (!memoryGet(visitKey)) {
        memoryWrite(visitKey, true, trackLifetime);
        memoryAdd(day, fields.visit, 1);
        memoryAdd(day, fields.entry, 1);
      }
      if (fields.engaged && !memoryGet(engagementKey)) {
        memoryWrite(engagementKey, true, trackLifetime);
        memoryAdd(day, fields.engaged, 1);
      }
      memoryAdd(day, fields.action, 1);
    },
    async readMetrics(day) {
      if (!live) return [...(counters.get(day) || new Map())];
      const data = await redis(['HGETALL', metricsKey(day)]);
      if (!Array.isArray(data)) return Object.entries(data || {});
      const result = [];
      for (let i = 0; i < data.length; i += 2) result.push([data[i], Number(data[i + 1])]);
      return result;
    },
    async rate(key, seconds) {
      if (live) {
        const increment = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
        return Number(await redis(['EVAL', increment, 1, recordKey('rate', key), seconds]));
      }
      const name = recordKey('rate', key);
      const count = (memoryGet(name) || 0) + 1;
      memoryWrite(name, count, seconds);
      return count;
    },
  };
}
