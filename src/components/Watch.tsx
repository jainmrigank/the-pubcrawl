import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchVideos, postWatchEvent } from '../api';
import type { WatchLane, WatchLibrary, WatchVideo } from '../types';
import { ArrowRight, Check, Play, Search, Share, Shuffle, X } from '../icons';
import { shareContent, videoShareText } from '../share';
import { LANDING_WATCH_SEED, WATCH_BOOTSTRAP_LIBRARY, WATCH_CATALOGUE_COUNT, thumbnailForWatch, watchLaneLabel } from '../watchData';

type Tab = 'watched' | 'new' | 'surprise';

const TABS: { id: Tab; label: string; note: string }[] = [
  { id: 'watched', label: 'MOST WATCHED', note: 'The biggest of them, by views' },
  { id: 'new', label: 'NEW & RISING', note: 'Climbing fastest, and just added' },
  { id: 'surprise', label: 'SURPRISE ME', note: 'Three at random, no decisions' },
];

const PAGE = 24;

/** 12.4M rather than 12,438,201: nobody reads the last six digits */
function short(n: number | null, unit: string): string | null {
  if (n == null) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B ${unit}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M ${unit}`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K ${unit}`;
  return `${n} ${unit}`;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function randomIndex(length: number) {
  if (!length) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function randomFeaturedVideos(count = 6): WatchVideo[] {
  const pool = [...LANDING_WATCH_SEED];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

interface WatchTeaserProps {
  active?: boolean;
  catalogueCount?: number;
}

/** Static landing facade: no API request and no iframe until the visitor opens Watch. */
export function WatchTeaser({ active = true, catalogueCount = WATCH_CATALOGUE_COUNT }: WatchTeaserProps) {
  const [featured, setFeatured] = useState(() => randomFeaturedVideos());
  const wasActive = useRef(active);
  const impressionSent = useRef(false);
  const teaserRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (active && !wasActive.current) {
      setFeatured(randomFeaturedVideos());
      trackRef.current?.scrollTo({ left: 0, behavior: 'auto' });
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    impressionSent.current = false;
    if (!active || !featured || !teaserRef.current) return;
    const send = () => {
      if (impressionSent.current) return;
      impressionSent.current = true;
      postWatchEvent({ type: 'preview-impression' }).catch(() => {});
    };
    if (!('IntersectionObserver' in window)) {
      send();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) send();
    }, { threshold: [0.5] });
    observer.observe(teaserRef.current);
    return () => observer.disconnect();
  }, [active, featured]);

  if (!featured.length) return null;
  return (
    <section className="watch-teaser" ref={teaserRef} aria-labelledby="watch-teaser-title">
      <div className="watch-teaser-head">
        <span id="watch-teaser-title" className="k-label">WATCH / THE BAR ON FILM</span>
        <span className="k-label dim">6 PICKS · {catalogueCount} VIDEOS</span>
      </div>
      <div ref={trackRef} className="watch-teaser-track" aria-label="Featured Watch videos">
        {featured.map((video, index) => {
          const lane = watchLaneLabel[video.lane] || video.lane.toUpperCase();
          return (
            <a
              key={video.id}
              className="watch-teaser-card"
              href={`#/watch?v=${encodeURIComponent(video.id)}&src=landing`}
            >
              <span className="watch-teaser-media">
                <img src={thumbnailForWatch(video)} alt="" loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />
                <span className="watch-teaser-play" aria-hidden="true"><Play size={16} /></span>
              </span>
              <span className="watch-teaser-copy">
                <span className="k-label watch-teaser-lane">{lane}</span>
                <strong>{video.title}</strong>
                <span className="k-label dim">{video.channel}</span>
                <span className="watch-teaser-open">OPEN WATCH <ArrowRight size={12} /></span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

/**
 * One video. The still is a facade: YouTube's player, and everything it drags
 * in with it, arrives only when someone actually asks for it. Thumbnails come
 * straight off i.ytimg.com, which needs no key and no script.
 */
function VideoCard({ v, lanes, active, autoPlay }: { v: WatchVideo; lanes: WatchLane[]; active: boolean; autoPlay: boolean }) {
  const [playing, setPlaying] = useState(autoPlay);
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle');
  const lane = lanes.find((l) => l.id === v.lane);
  const views = short(v.views, 'views');
  const likes = short(v.likes, 'likes');

  useEffect(() => {
    if (autoPlay) setPlaying(true);
    if (!active) setPlaying(false);
  }, [active, autoPlay]);

  async function doShare() {
    const outcome = await shareContent(`${v.title} · The PubCrawl`, videoShareText(v.title, v.channel, v.id));
    // the native sheet says its own piece; only the clipboard path needs telling
    if (outcome === 'copied' || outcome === 'failed') {
      setShared(outcome);
      setTimeout(() => setShared('idle'), 1600);
    }
  }

  return (
    <article className="wv" data-video-id={v.id}>
      <div className="wv-frame">
        {active && playing ? (
          <iframe
            className="wv-player"
            src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.origin)}`}
            title={v.title}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button className="wv-thumb" onClick={() => setPlaying(true)} aria-label={`Play ${v.title}`}>
            <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
            <span className="wv-play">
              <Play size={20} />
            </span>
          </button>
        )}
      </div>
      <div className="wv-meta">
        <div className="wv-top">
          {lane && (
            <span className="k-label wv-lane">
              <i style={{ background: lane.color }} />
              {lane.label}
            </span>
          )}
          <button
            className={`wv-share ${shared !== 'idle' ? 'said' : ''}`}
            onClick={doShare}
            aria-label={`Share ${v.title}`}
            data-tip={shared === 'copied' ? 'COPIED!' : shared === 'failed' ? 'SHARING BLOCKED HERE' : 'SHARE THIS VIDEO'}
          >
            {shared === 'copied' ? <Check size={14} /> : <Share size={14} />}
          </button>
        </div>
        <h3 className="wv-title">{v.title}</h3>
        <p className="k-label dim wv-by">
          <span>{v.channel}</span>
          {views && <span className="wv-stat">{views}</span>}
          {likes && <span className="wv-stat">{likes}</span>}
        </p>
      </div>
    </article>
  );
}

/** three at random, spread across kinds so it is never three of the same */
function pickThree(pool: WatchVideo[], exclude: Set<string>): WatchVideo[] {
  const bag = pool.filter((v) => !exclude.has(v.id));
  const source = bag.length >= 3 ? bag : pool;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  const out: WatchVideo[] = [];
  const usedLanes = new Set<string>();
  for (const v of shuffled) {
    if (out.length >= 3) break;
    if (usedLanes.has(v.lane)) continue;
    usedLanes.add(v.lane);
    out.push(v);
  }
  for (const v of shuffled) {
    if (out.length >= 3) break;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * The Watch library. Search and the kind filter narrow the whole shelf; the
 * three tabs decide how what is left is ordered. Everything defaults to
 * most-watched first, because with a few hundred videos that is the only
 * ordering anyone can reason about.
 */
interface WatchProps {
  active?: boolean;
  initialId?: string;
  source?: string;
}

function eventSource(source: string): 'landing' | 'nav' | 'deep-link' | 'direct' {
  return source === 'landing' || source === 'nav' || source === 'deep-link' ? source : 'direct';
}

export function Watch({ active = true, initialId = '', source = 'direct' }: WatchProps) {
  // A tiny reviewed bootstrap renders immediately. The complete curated
  // watchlist remains a lazy chunk, while the API response is optional live
  // enrichment; neither slow dependency can leave Watch on an empty spinner.
  const [data, setData] = useState<WatchLibrary | null>(WATCH_BOOTSTRAP_LIBRARY);
  const [error, setError] = useState(false);
  const loadStartedRef = useRef(false);
  const dataSourceRef = useRef<'bootstrap' | 'static' | 'api'>('bootstrap');

  useEffect(() => {
    if (!active) {
      loadStartedRef.current = false;
      return;
    }
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    let cancelled = false;

    const accept = (library: WatchLibrary, source: 'static' | 'api') => {
      if (!Array.isArray(library?.videos) || library.videos.length === 0) {
        return;
      }
      if (cancelled) return;
      // API data includes the health sweep's unavailable-video removals and
      // must not be replaced by a slower static-chunk response.
      if (source === 'static' && dataSourceRef.current === 'api') return;
      dataSourceRef.current = source;
      setError(false);
      setData(library);
    };

    // The local catalogue and live statistics are independent. Whichever
    // complete source arrives first replaces the bootstrap; a stalled request
    // can never leave Watch stuck behind an indefinite loading state.
    import('../watchLibrary')
      .then(({ STATIC_WATCH_LIBRARY }) => accept(STATIC_WATCH_LIBRARY, 'static'))
      .catch(() => {});
    fetchVideos()
      .then((library) => accept(library, 'api'))
      .catch(() => {
        if (cancelled) return;
        // Keep the local bootstrap visible on API failure; show the error only
        // if a future build ever ships without any bundled cards.
        if (!WATCH_BOOTSTRAP_LIBRARY.videos.length) setError(true);
      });

    return () => {
      cancelled = true;
      // A later route visit gets a fresh chance to refresh API statistics.
      loadStartedRef.current = false;
    };
  }, [active]);

  if (error && !data)
    return (
      <section className="sec page-top">
        <p className="err" role="alert">
          The projector is not warming up. Try again in a moment.
        </p>
      </section>
    );

  if (!data)
    return (
      <section className="sec page-top">
        <span className="loadline" aria-label="Loading" />
      </section>
    );

  return <WatchShelf data={data} active={active} initialId={initialId} source={source} />;
}

interface WatchShelfProps extends Required<WatchProps> {
  data: WatchLibrary;
}

function WatchShelf({ data, active, initialId, source }: WatchShelfProps) {
  const [tab, setTab] = useState<Tab>('watched');
  const [q, setQ] = useState('');
  const [lane, setLane] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [surprise, setSurprise] = useState<WatchVideo[]>([]);
  const [promotedId, setPromotedId] = useState<string | null>(null);
  const openedKeyRef = useRef('');

  useEffect(() => {
    if (!active) {
      openedKeyRef.current = '';
      setPromotedId(null);
      return;
    }
    // Treat a deep-link change while Watch stays mounted as a new route visit;
    // ordinary renders of the same promoted card remain one aggregate open.
    const visitKey = `${eventSource(source)}:${initialId || ''}`;
    if (openedKeyRef.current === visitKey) return;
    openedKeyRef.current = visitKey;
    postWatchEvent({ type: 'open', source: eventSource(source) }).catch(() => {});
  }, [active, initialId, source]);

  // A landing deep link is an instruction to promote that exact card, not a
  // new search. Clear filters first, then let the rendered card scroll into
  // view and open its native player.
  useEffect(() => {
    if (!active || !data || !initialId) return;
    const exists = data.videos.some((video) => video.id === initialId);
    setQ('');
    setLane('');
    setTab('watched');
    setShown(PAGE);
    setPromotedId(exists ? initialId : null);
  }, [active, data, initialId]);

  // a new search or filter starts the list from the top again
  useEffect(() => setShown(PAGE), [q, lane, tab]);

  /** search and kind first, then always most-watched, likes breaking ties */
  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    const lanes = new Map(data.lanes.map((l) => [l.id, l.label]));
    return data.videos
      .filter((v) => {
        if (lane && v.lane !== lane) return false;
        if (!needle) return true;
        // the lane id as well as its label, so "comedy" finds For The Laugh
        return norm(`${v.title} ${v.channel} ${v.lane} ${lanes.get(v.lane) || ''}`).includes(needle);
      })
      .sort((a, b) => (b.views || 0) - (a.views || 0) || (b.likes || 0) - (a.likes || 0) || a.rank - b.rank);
  }, [data, q, lane]);

  /**
   * Rising means the growth we measured ourselves, since YouTube will not tell
   * you a video's views this month. Until enough snapshots exist it falls back
   * to whatever was added most recently, which is at least honestly different
   * from the most-watched tab.
   */
  const rising = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          b.movement - a.movement ||
          Date.parse(b.addedAt || '') - Date.parse(a.addedAt || '') ||
          (b.views || 0) - (a.views || 0)
      ),
    [filtered]
  );

  const shuffle = useCallback(() => {
    setSurprise((prev) => pickThree(filtered, new Set(prev.map((v) => v.id))));
  }, [filtered]);

  // keep the surprise picks inside whatever is currently filtered
  useEffect(() => {
    if (!filtered.length) return;
    setSurprise((prev) => (prev.length && prev.every((v) => filtered.includes(v)) ? prev : pickThree(filtered, new Set())));
  }, [filtered]);

  const baseOrdered = tab === 'surprise' ? surprise : tab === 'new' ? rising : filtered;
  const ordered = promotedId && tab !== 'surprise'
    ? [
        ...baseOrdered.filter((video) => video.id === promotedId),
        ...baseOrdered.filter((video) => video.id !== promotedId),
      ]
    : baseOrdered;
  const list = tab === 'surprise' ? ordered : ordered.slice(0, shown);
  const more = tab !== 'surprise' && ordered.length > shown;
  const current = TABS.find((t) => t.id === tab)!;

  useEffect(() => {
    if (!active || !promotedId || !list.some((video) => video.id === promotedId)) return;
    const frame = requestAnimationFrame(() => {
      const card = [...document.querySelectorAll<HTMLElement>('.watch [data-video-id]')]
        .find((element) => element.dataset.videoId === promotedId);
      card?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, list, promotedId]);

  return (
    <div className="watch page-top">
      <div className="sec-head">
        <div className="rule" />
        <div className="sec-head-row">
          <span className="k-label sec-index">/01</span>
          <h2 className="sec-title">WATCH</h2>
          <span className="k-label dim sec-note">
            {q || lane ? `${filtered.length} OF ${data.videos.length}` : `${data.videos.length} VIDEOS`}
          </span>
        </div>
        <p className="sec-lead">
          Everything worth watching about drinking. The craft, the history, the comedy, and people finding
          out what they like.
        </p>
      </div>

      <div className="wv-search field">
        <Search size={16} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a video, a channel, a spirit…"
          aria-label="Search the video library"
        />
        {q && (
          <button className="wv-clear" onClick={() => setQ('')} aria-label="Clear search">
            <X size={13} />
          </button>
        )}
      </div>

      <div className="wv-filters">
        <span className="k-label dim wv-filters-label">KIND</span>
        <select
          className="wv-kind-select"
          value={lane}
          aria-label="Filter videos by kind"
          onChange={(event) => setLane(event.target.value)}
        >
          <option value="">All</option>
          {data.lanes.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <div className="wv-kind-pills" aria-label="Filter videos by kind">
          <button className={`vibe-chip ${lane === '' ? 'on' : ''}`} onClick={() => setLane('')}>
            ALL
          </button>
          {data.lanes.map((l) => (
            <button
              key={l.id}
              className={`vibe-chip ${lane === l.id ? 'on' : ''}`}
              style={{ ['--vc' as string]: l.color }}
              onClick={() => setLane(lane === l.id ? '' : l.id)}
            >
              <i className="swatch" />
              {l.label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="wv-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`wv-tab ${tab === t.id ? 'on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="k-label dim wv-tabnote">
        {current.note}
        {tab === 'surprise' && (
          <button className="text-btn wv-shuffle-btn" onClick={shuffle}>
            SHUFFLE <Shuffle size={13} />
          </button>
        )}
      </p>

      {list.length === 0 ? (
        <p className="wv-empty">Nothing here for that. Try a spirit, a channel, or clear the filters.</p>
      ) : (
        <div className="wv-grid">
          {list.map((v) => (
            <VideoCard key={v.id} v={v} lanes={data.lanes} active={active} autoPlay={promotedId === v.id} />
          ))}
        </div>
      )}

      {more && (
        <div className="wv-more">
          <button className="btn btn-solid" onClick={() => setShown((n) => n + PAGE)}>
            SHOW MORE
          </button>
          <span className="k-label dim">
            {list.length} OF {ordered.length}
          </span>
        </div>
      )}

      <p className="wv-foot k-label dim">
        Everything here lives on YouTube. Tap a still and it plays in place.
        {!data.hasNumbers && ' View counts arrive once the shelf has been counted.'}
      </p>
    </div>
  );
}
