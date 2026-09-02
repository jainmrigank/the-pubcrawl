import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createShortsInitializationPool,
  ShortsInitializationTimeoutError,
  waitForShortsInitialization,
} from '../src/shortsPlayerPool.ts';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushPool() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test('initialization pool starts no more than two tasks and honors priority', async () => {
  const pool = createShortsInitializationPool(2);
  const gates = [deferred(), deferred(), deferred()];
  const starts = [];

  pool.request(0, 2, async () => {
    starts.push(0);
    await gates[0].promise;
  });
  pool.request(1, 0, async () => {
    starts.push(1);
    await gates[1].promise;
  });
  pool.request(2, 1, async () => {
    starts.push(2);
    await gates[2].promise;
  });

  await flushPool();
  assert.deepEqual(starts, [1, 2]);
  assert.deepEqual(pool.snapshot(), { queued: 1, inFlight: 2, destroyed: false });

  gates[1].resolve();
  await flushPool();
  assert.deepEqual(starts, [1, 2, 0]);
  assert.deepEqual(pool.snapshot(), { queued: 0, inFlight: 2, destroyed: false });

  gates[0].resolve();
  gates[2].resolve();
  await flushPool();
  assert.equal(pool.snapshot().inFlight, 0);
});

test('queued initialization can be reprioritized or cancelled safely', async () => {
  const pool = createShortsInitializationPool(1);
  const first = deferred();
  const starts = [];

  pool.request(0, 0, async () => {
    starts.push(0);
    await first.promise;
  });
  const cancelOne = pool.request(1, 10, async () => {
    starts.push(1);
  });
  const cancelTwo = pool.request(2, 20, async () => {
    starts.push(2);
  });

  await flushPool();
  cancelTwo.updatePriority(1);
  cancelOne();
  first.resolve();
  await flushPool();

  assert.deepEqual(starts, [0, 2]);
  assert.deepEqual(pool.snapshot(), { queued: 0, inFlight: 0, destroyed: false });
});

test('cancelling an in-flight API wait aborts and releases its slot immediately', async () => {
  const pool = createShortsInitializationPool(1);
  const cancelledStart = deferred();
  const nextStart = deferred();
  const starts = [];
  let cancelledSignal;

  const cancel = pool.request(0, 0, async (signal) => {
    starts.push(0);
    cancelledSignal = signal;
    await cancelledStart.promise;
  });
  pool.request(1, 1, async () => {
    starts.push(1);
    await nextStart.promise;
  });

  await flushPool();
  cancel();
  await flushPool();
  assert.equal(cancelledSignal.aborted, true);
  assert.deepEqual(starts, [0, 1]);
  assert.equal(pool.snapshot().inFlight, 1);

  cancelledStart.resolve();
  await flushPool();
  assert.deepEqual(starts, [0, 1]);
  assert.equal(pool.snapshot().inFlight, 1);

  nextStart.resolve();
  await flushPool();
  assert.equal(pool.snapshot().inFlight, 0);
});

test('destroy prevents queued work from starting', async () => {
  const pool = createShortsInitializationPool(1);
  let started = false;
  pool.request(0, 0, async () => {
    started = true;
  });
  pool.destroy();
  await flushPool();
  assert.equal(started, false);
  assert.deepEqual(pool.snapshot(), { queued: 0, inFlight: 0, destroyed: true });
});

test('a stalled iframe wait times out exactly once', async () => {
  const gate = deferred();
  let timedOut = 0;
  await assert.rejects(
    waitForShortsInitialization(gate.promise, 5, () => { timedOut += 1; }),
    ShortsInitializationTimeoutError,
  );
  assert.equal(timedOut, 1);
  gate.resolve();
  await flushPool();
  assert.equal(timedOut, 1);
});
