/**
 * Pure classification for the fields returned by YouTube's `videos.list`
 * endpoint. Keeping this separate from the network call lets the scheduled
 * refresh fail closed in a predictable way and gives the catalogue tests a
 * dependency-free surface.
 */

export function indiaAllowsVideo(regionRestriction) {
  if (!regionRestriction || typeof regionRestriction !== 'object') return true;
  const blocked = Array.isArray(regionRestriction.blocked) ? regionRestriction.blocked : [];
  if (blocked.includes('IN')) return false;
  const allowed = Array.isArray(regionRestriction.allowed) ? regionRestriction.allowed : null;
  return !allowed || allowed.length === 0 || allowed.includes('IN');
}

/**
 * Return a stable reason when a video cannot be shown. `short` applies the
 * extra age/made-for-kids gates required for the Shorts shelf; Watch keeps the
 * same public, processed, embeddable and India-available checks.
 */
export function classifyVideoStatus(item, { short = false } = {}) {
  if (!item || typeof item !== 'object' || !item.id) return { dead: true, reason: 'missing' };

  const status = item.status;
  if (!status || status.privacyStatus !== 'public') {
    return { dead: true, reason: `privacy:${status?.privacyStatus || 'unknown'}` };
  }
  if (status.uploadStatus !== 'processed') {
    return { dead: true, reason: `upload:${status.uploadStatus || 'unknown'}` };
  }
  if (status.embeddable !== true) return { dead: true, reason: 'not-embeddable' };

  const details = item.contentDetails || {};
  if (!indiaAllowsVideo(details.regionRestriction)) return { dead: true, reason: 'india-blocked' };

  if (short) {
    if (status.madeForKids === true || status.selfDeclaredMadeForKids === true) {
      return { dead: true, reason: 'made-for-kids' };
    }
    if (details.contentRating?.ytRating === 'ytAgeRestricted') {
      return { dead: true, reason: 'age-restricted' };
    }
  }

  return { dead: false, reason: 'ok' };
}

export function parseYouTubeDuration(value) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(String(value || ''));
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}
