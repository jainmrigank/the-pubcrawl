import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchVideos } from '../api';
import type { WatchShelves, WatchVideo } from '../types';
import { Play, Shuffle } from '../icons';
import { EASE, LOADED_HIDDEN } from '../motion';

/** 12.4M rather than 12,438,201: nobody reads the last six digits */
function views(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B views`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M views`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K views`;
  return `${n} views`;
}

/**
 * One video. The thumbnail is a facade: YouTube's player, and everything it
 * loads with it, arrives only when someone actually asks for it. Thumbnails
 * come straight off i.ytimg.com, which needs no key and no script.
 */
function VideoCard({ v, index, lanes }: { v: WatchVideo; index: number; lanes: WatchShelves['lanes'] }) {
  const [playing, setPlaying] = useState(false);
  const lane = lanes.find((l) => l.id === v.lane);
  const count = views(v.views);

  return (
    <article className="wv">
      <div className="wv-frame">
        {playing ? (
          <iframe
            className="wv-player"
            src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1`}
            title={v.title}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button className="wv-thumb" onClick={() => setPlaying(true)} aria-label={`Play ${v.title}`}>
            <img
              src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span className="wv-play">
              <Play size={20} />
            </span>
          </button>
        )}
      </div>
      <div className="wv-meta">
        <div className="wv-top">
          <span className="k-label dim">N° {String(index + 1).padStart(3, '0')}</span>
          {lane && (
            <span className="k-label wv-lane">
              <i style={{ background: lane.color }} />
              {lane.label}
            </span>
          )}
        </div>
        <h3 className="wv-title">{v.title}</h3>
        <p className="k-label dim wv-by">
          {v.channel}
          {count && <span className="wv-views">{count}</span>}
          {v.why && <span className="wv-why">{v.why}</span>}
        </p>
      </div>
    </article>
  );
}

function Shelf({
  index,
  title,
  note,
  lead,
  videos,
  lanes,
  action,
}: {
  index: string;
  title: string;
  note: string;
  lead?: string;
  videos: WatchVideo[];
  lanes: WatchShelves['lanes'];
  action?: React.ReactNode;
}) {
  if (!videos.length) return null;
  return (
    <section className="sec">
      <div className="sec-head">
        <motion.div
          className="rule"
          initial={LOADED_HIDDEN ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.9, ease: EASE }}
          style={{ transformOrigin: 'left' }}
        />
        <div className="sec-head-row">
          <span className="k-label sec-index">/{index}</span>
          <h2 className="sec-title">{title}</h2>
          <span className="k-label dim sec-note">{note}</span>
        </div>
        {lead && <p className="sec-lead">{lead}</p>}
      </div>
      {action}
      <div className="wv-grid">
        {videos.map((v, i) => (
          <VideoCard key={v.id} v={v} index={i} lanes={lanes} />
        ))}
      </div>
    </section>
  );
}

/** three at random, but never three of the same kind in a row */
function pickThree(pool: WatchVideo[], exclude: Set<string>): WatchVideo[] {
  const out: WatchVideo[] = [];
  const usedLanes = new Set<string>();
  const bag = pool.filter((v) => !exclude.has(v.id));
  const source = bag.length >= 3 ? bag : pool;
  const shuffled = [...source].sort(() => Math.random() - 0.5);

  for (const v of shuffled) {
    if (out.length >= 3) break;
    if (usedLanes.has(v.lane)) continue;
    usedLanes.add(v.lane);
    out.push(v);
  }
  // if the pool is lane-poor, fill the rest with anything left
  for (const v of shuffled) {
    if (out.length >= 3) break;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * The Watch shelf. Three ways in: the biggest of them, what is moving right
 * now, and three at random for when you do not want to choose.
 */
export function Watch() {
  const [data, setData] = useState<WatchShelves | null>(null);
  const [error, setError] = useState(false);
  const [random, setRandom] = useState<WatchVideo[]>([]);

  useEffect(() => {
    fetchVideos()
      .then((d) => {
        setData(d);
        setRandom(pickThree(d.pool, new Set()));
      })
      .catch(() => setError(true));
  }, []);

  const shuffle = useCallback(() => {
    if (!data) return;
    setRandom((prev) => pickThree(data.pool, new Set(prev.map((v) => v.id))));
  }, [data]);

  const lanes = useMemo(() => data?.lanes ?? [], [data]);

  if (error)
    return (
      <section className="sec page-top">
        <p className="err" role="alert">
          The projector is not warming up. Try again in a moment.
        </p>
      </section>
    );

  if (!data) return <section className="sec page-top"><span className="loadline" aria-label="Loading" /></section>;

  return (
    <div className="watch page-top">
      <Shelf
        index="01"
        title="THE BIG ONES"
        note={`${data.allTime.length} TO WATCH`}
        lead="The cocktail videos everybody has already seen, and the ones they should have."
        videos={data.allTime}
        lanes={lanes}
      />
      <Shelf
        index="02"
        title={data.risingMode === 'climbing' ? 'CLIMBING' : 'JUST ADDED'}
        note={data.risingMode === 'climbing' ? 'MOVING RIGHT NOW' : 'NEW ON THE SHELF'}
        lead={
          data.risingMode === 'climbing'
            ? 'What is picking up views, plus whatever we put on the shelf this month.'
            : 'The newest additions. Once we have watched the numbers for a few weeks, this becomes whatever is climbing fastest.'
        }
        videos={data.rising}
        lanes={lanes}
      />
      <Shelf
        index="03"
        title="THREE AT RANDOM"
        note="NO DECISIONS REQUIRED"
        videos={random}
        lanes={lanes}
        action={
          <div className="wv-shuffle">
            <button className="btn btn-solid" onClick={shuffle}>
              SHUFFLE <Shuffle size={14} />
            </button>
            <span className="k-label dim">{data.pool.length} IN THE LIBRARY</span>
          </div>
        }
      />
      <p className="wv-foot k-label dim">
        Everything here lives on YouTube. Tap a still and it plays in place.{' '}
        {!data.hasNumbers && 'View counts arrive once the shelf has been counted.'}
      </p>
    </div>
  );
}
