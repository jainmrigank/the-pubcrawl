/** A bounded, cancellation-safe scheduler for YouTube iframe initialization. */

export type InitializationLease = (() => void) & {
  updatePriority: (priority: number) => void;
};

interface InitializationTask {
  index: number;
  priority: number;
  start: (signal: AbortSignal) => Promise<void>;
  controller: AbortController;
  cancelled: boolean;
  started: boolean;
  released: boolean;
  sequence: number;
}

export interface ShortsInitializationPool {
  request(index: number, priority: number, start: (signal: AbortSignal) => Promise<void>): InitializationLease;
  destroy(): void;
  snapshot(): { queued: number; inFlight: number; destroyed: boolean };
}

export class ShortsInitializationTimeoutError extends Error {
  constructor() {
    super('YouTube iframe initialization timed out');
    this.name = 'ShortsInitializationTimeoutError';
  }
}

/**
 * Bound the period for which an iframe shell may occupy an initialization
 * slot. The caller owns player teardown; this helper guarantees the
 * queue-facing promise always settles.
 */
export function waitForShortsInitialization(
  initialized: Promise<void>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<void> {
  const delay = Math.max(1, Math.floor(timeoutMs));
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        onTimeout();
      } finally {
        reject(new ShortsInitializationTimeoutError());
      }
    }, delay);
    initialized.then(
      () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        resolve();
      },
      (error) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createShortsInitializationPool(maxConcurrent = 2): ShortsInitializationPool {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  let queue: InitializationTask[] = [];
  let inFlight = 0;
  let sequence = 0;
  let drainScheduled = false;
  let destroyed = false;
  const active = new Set<InitializationTask>();

  const sort = () => queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);

  function release(task: InitializationTask) {
    if (task.released) return;
    task.released = true;
    active.delete(task);
    if (task.started) inFlight = Math.max(0, inFlight - 1);
    scheduleDrain();
  }

  function drain() {
    if (destroyed) return;
    sort();
    while (inFlight < limit && queue.length) {
      const task = queue.shift();
      if (!task || task.cancelled) continue;
      task.started = true;
      active.add(task);
      inFlight += 1;
      Promise.resolve(task.start(task.controller.signal))
        .catch(() => {})
        .finally(() => release(task));
    }
  }

  function scheduleDrain() {
    if (destroyed || drainScheduled) return;
    drainScheduled = true;
    queueMicrotask(() => {
      drainScheduled = false;
      drain();
    });
  }

  return {
    request(index, priority, start) {
      const task: InitializationTask = {
        index,
        priority: Number.isFinite(priority) ? priority : Number.MAX_SAFE_INTEGER,
        start,
        controller: new AbortController(),
        cancelled: false,
        started: false,
        released: false,
        sequence: sequence++,
      };
      if (!destroyed) {
        queue.push(task);
        sort();
        scheduleDrain();
      }

      const cancel = (() => {
        if (task.cancelled) return;
        task.cancelled = true;
        task.controller.abort();
        queue = queue.filter((entry) => entry !== task);
        // A disposed host cannot construct another iframe: its abort signal
        // is checked after the shared YouTube API resolves, and host cleanup
        // synchronously destroys any shell already created. Release the slot
        // now so two cancelled API waits cannot stall the newly active card.
        if (task.started) release(task);
      }) as InitializationLease;

      cancel.updatePriority = (nextPriority: number) => {
        if (destroyed || task.cancelled || task.started || !Number.isFinite(nextPriority)) return;
        task.priority = nextPriority;
        sort();
        scheduleDrain();
      };
      return cancel;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const task of queue) task.cancelled = true;
      queue = [];
      for (const task of active) {
        task.cancelled = true;
        task.controller.abort();
        release(task);
      }
    },

    snapshot() {
      return { queued: queue.length, inFlight, destroyed };
    },
  };
}
