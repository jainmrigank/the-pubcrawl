/** Atomic quiz state, shared by Express and Workers. No browser-supplied scores. */
export const QUIZ_RUN_TTL = 4 * 60 * 60;
const HIGH_KEY = 'pubcrawl:highscore';
const copy = (value) => structuredClone(value);

export function createQuizRecordStore({ command, available = true, readLocal = () => ({ score: 0, at: 0 }), writeLocal = () => {} } = {}) {
  const runs = new Map();
  const limits = new Map();
  let record = null;
  const ensure = () => { if (!available) throw new Error('Shared quiz storage is unavailable'); };
  const readRecord = async () => {
    ensure();
    if (command) return JSON.parse(await command(['GET', HIGH_KEY]) || '{"score":0,"at":0}');
    return copy(record || readLocal());
  };
  const save = (next) => { writeLocal(next); record = copy(next); };
  const sweep = (map) => {
    for (const [key, value] of map) if (value.expires <= Date.now()) map.delete(key);
  };
  return {
    readRecord,
    async limit(client, action, cap) {
      ensure();
      const key = `pubcrawl:quiz:limit:${action}:${client}`;
      if (command) {
        const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600) end; return n";
        return Number(await command(['EVAL', script, 1, key])) <= cap;
      }
      sweep(limits);
      if (!limits.has(key) && limits.size >= 10000) return false;
      const value = limits.get(key) || { count: 0, expires: Date.now() + 3600000 };
      value.count++;
      limits.set(key, value);
      return value.count <= cap;
    },
    async createRun(token, state) {
      ensure();
      const key = `pubcrawl:quiz:run:${token}`;
      if (command) return await command(['SET', key, JSON.stringify(state), 'EX', QUIZ_RUN_TTL, 'NX']) === 'OK';
      sweep(runs);
      if (runs.size >= 5000) throw new Error('Quiz is busy');
      if (runs.has(token)) return false;
      runs.set(token, { state: copy(state), expires: Date.now() + QUIZ_RUN_TTL * 1000 });
      return true;
    },
    async readRun(token) {
      ensure();
      if (command) {
        const raw = await command(['GET', `pubcrawl:quiz:run:${token}`]);
        return raw ? JSON.parse(raw) : null;
      }
      sweep(runs);
      return copy(runs.get(token)?.state || null);
    },
    async commit(token, revision, next) {
      ensure();
      if (command) {
        // One transaction advances the run AND replaces the score/name pair.
        // CAS prevents simultaneous answers, replays and competing winners
        // from losing updates. Tokens are private and never sent by GET /high.
        const script = `
          local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end
          local old=cjson.decode(raw); if old.revision~=tonumber(ARGV[1]) then return 0 end
          local next=cjson.decode(ARGV[2]); local high={score=0,at=0}
          local h=redis.call('GET',KEYS[2]); if h then high=cjson.decode(h) end
          if next.done and next.score>(tonumber(high.score) or 0) then
            high={score=next.score,at=next.at,owner=ARGV[3]}
            redis.call('SET',KEYS[2],cjson.encode(high)); next.beaten=true
          end
          redis.call('SET',KEYS[1],cjson.encode(next),'EX',ARGV[4])
          return cjson.encode({state=next,record=high})`;
        const result = await command(['EVAL', script, 2, `pubcrawl:quiz:run:${token}`, HIGH_KEY, revision, JSON.stringify(next), next.owner, QUIZ_RUN_TTL]);
        return result ? JSON.parse(result) : null;
      }
      sweep(runs);
      const entry = runs.get(token);
      if (!entry || entry.state.revision !== revision) return false;
      const high = record || readLocal();
      if (next.done && next.score > high.score) {
        save({ score: next.score, at: next.at, owner: next.owner });
        next = { ...next, beaten: true };
      }
      runs.set(token, { state: copy(next), expires: Date.now() + QUIZ_RUN_TTL * 1000 });
      return { state: copy(next), record: copy(record || readLocal()) };
    },
    async claim(owner, name) {
      ensure();
      if (command) {
        const script = `
          local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end
          local high=cjson.decode(raw)
          if high.owner~=ARGV[1] or (high.name and high.name~=ARGV[2]) then return 0 end
          high.name=ARGV[2]; redis.call('SET',KEYS[1],cjson.encode(high)); return 1`;
        return Number(await command(['EVAL', script, 1, HIGH_KEY, owner, name])) === 1;
      }
      const high = record || readLocal();
      if (high.owner !== owner || (high.name && high.name !== name)) return false;
      save({ ...high, name });
      return true;
    },
  };
}
