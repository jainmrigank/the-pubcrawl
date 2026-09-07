import test from 'node:test';
import assert from 'node:assert/strict';
import { YT_PLAYER_STATES } from '../src/shortsPlayer.ts';
// Sound-command coverage now exercises the production controller, not retired
// adapter helpers that the application never called (shorts-controller.test).

test('YouTube state constants remain aligned with the documented iframe API', () => {
  assert.deepEqual(YT_PLAYER_STATES, {
    UNSTARTED: -1,
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5,
  });
});
