import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createYouTubePlayer, type YouTubePlayer } from '../../shortsPlayer';
import { ShortsController, type ShortsSelection, type ShortsSnapshot } from '../../shortsController';
import { readShortsRatePreference, readShortsSoundPreference, writeShortsRatePreference, writeShortsSoundPreference } from '../../shortsSoundPolicy';
import { overlayGate } from '../../overlayGate';

export interface ShortPlayerHostHandle {
  select(selection: ShortsSelection): void;
  suspend(reason: string, enabled: boolean): void;
}

interface Props {
  selection: ShortsSelection;
  onSnapshot(snapshot: ShortsSnapshot): void;
  onMotion(sample: { videoId: string; generation: number; startupMs: number; muted: boolean; recoveryUsed: boolean }): void;
  onFailure(): void;
  onBuffering(): void;
}

/** Owns construction/destruction only. All media commands live in the controller. */
export const ShortPlayerHost = forwardRef<ShortPlayerHostHandle, Props>(function ShortPlayerHost(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<ShortsController | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [snapshot, setSnapshot] = useState<ShortsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    select: (selection) => controller.current?.select(selection),
    suspend: (reason, enabled) => controller.current?.suspend(reason, enabled),
  }), []);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    const control = new ShortsController({
      sound: readShortsSoundPreference(), preferredRate: readShortsRatePreference().preferredRate,
      onSnapshot: (next) => {
        if (cancelled) return;
        setSnapshot(next);
        latest.current.onSnapshot(next);
      },
      onSound: writeShortsSoundPreference,
      onRate: (preferredRate) => writeShortsRatePreference({ version: 1, preferredRate }),
      onMotion: (sample) => latest.current.onMotion(sample),
      onFailure: () => latest.current.onFailure(),
      onBuffering: () => latest.current.onBuffering(),
    });
    controller.current = control;
    const syncEnvironment = () => {
      control.suspend('overlay', Boolean(overlayGate.active));
      control.suspend('hidden', document.hidden);
      control.suspend('offline', !navigator.onLine);
    };
    // Apply lifecycle reasons before selecting/attaching, including an auto-tour
    // that acquired the gate while the YouTube script was still loading.
    syncEnvironment();
    control.select(latest.current.selection);
    const unsubscribe = overlayGate.subscribe(syncEnvironment);
    document.addEventListener('visibilitychange', syncEnvironment);
    window.addEventListener('online', syncEnvironment);
    window.addEventListener('offline', syncEnvironment);
    const mount = document.createElement('div');
    root.appendChild(mount);
    void createYouTubePlayer(mount, latest.current.selection.videoId, {
      onReady: (readyPlayer) => { if (!cancelled) control.attach(readyPlayer); },
      onStateChange: (p, state) => control.onState(p, state),
      onError: (p) => control.onError(p),
      onAutoplayBlocked: (p) => control.onBlocked(p),
      onPlaybackRateChange: (p, rate) => control.onRate(p, rate),
    }, () => cancelled).then((created) => {
      player = created;
      if (cancelled) created.destroy();
      else created.getIframe?.()?.setAttribute('title', 'YouTube Shorts player');
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', syncEnvironment);
      window.removeEventListener('online', syncEnvironment);
      window.removeEventListener('offline', syncEnvironment);
      control.dispose();
      player?.destroy();
      root.replaceChildren();
      if (controller.current === control) controller.current = null;
    };
  }, []);

  // Deep-link changes before readiness still select the latest id. An already
  // committed imperative selection is a no-op, not a second start owner.
  useEffect(() => { controller.current?.select(props.selection); }, [props.selection.videoId, props.selection.index]);

  return (
    <div className={`shorts-player-layer ${snapshot?.motion ? 'is-revealed' : ''}`}
      data-player-ready={snapshot?.ready ? 'true' : 'false'} data-player-phase={snapshot?.phase ?? 'initializing'}
      data-sound-acknowledged={snapshot?.soundAcknowledged ? 'true' : 'false'}>
      <div className="shorts-player-host" ref={container} />
      {!snapshot?.ready && <div className="shorts-initial-status" role="status">
        {failed ? 'VIDEO COULD NOT LOAD · RECONNECT AND REOPEN SHORTS' : 'LOADING..'}
      </div>}
    </div>
  );
});
