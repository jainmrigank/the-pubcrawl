import { useRef, useState } from 'react';
import { identifyImage } from '../api';
import type { Ingredient } from '../types';
import { IngredientIcon } from './IngredientIcon';
import { Camera, Check } from '../icons';

interface Props {
  onAdd: (ing: Ingredient) => void;
  onAddAll: (ings: Ingredient[]) => void;
  pantry: Ingredient[];
}

type Shot = { b64: string; mime: string; preview: string };

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * What the file actually is, read off its first bytes.
 *
 * The name and the MIME type are both hearsay. An iOS photo picked inside an
 * installed app regularly arrives called image.jpg, typed image/jpeg, holding
 * HEIC, which is why this worked in a browser tab and failed in the PWA: the
 * old check believed the label, decided it was not HEIC, and skipped the
 * fallback that would have saved it.
 */
async function sniff(file: File): Promise<string> {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const ascii = (a: number, b: number) => String.fromCharCode(...head.slice(a, b));
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
    if (ascii(1, 4) === 'PNG') return 'image/png';
    if (ascii(0, 3) === 'GIF') return 'image/gif';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
    if (ascii(4, 8) === 'ftyp') return /^avi[fs]/.test(ascii(8, 12)) ? 'image/avif' : 'image/heic';
  } catch {
    /* unreadable head: fall back to what the file claims */
  }
  return file.type || '';
}

/** the whole file, untouched, for when the browser cannot decode it but the model can */
function rawBytes(file: File): Promise<Shot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      const b64 = url.split(',')[1];
      if (!b64) return reject(new Error('empty file'));
      resolve({ b64, mime: file.type || 'image/jpeg', preview: '' });
    };
    reader.onerror = () => reject(new Error('could not read the file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale to ≤1024px JPEG so uploads stay small.
 *
 * Two decoders, because one is not enough. createImageBitmap handles more
 * formats than an <img> and can apply EXIF rotation, so photos taken sideways
 * arrive the right way up. The <img> path stays as a fallback for browsers
 * without it.
 *
 * Neither can decode HEIC outside Safari, which is what iPhones shoot by
 * default, so that case is handled by the caller rather than pretended away.
 */
async function shrink(file: File): Promise<Shot> {
  const draw = (src: ImageBitmap | HTMLImageElement, w: number, h: number): Shot => {
    const scale = Math.min(1, 1024 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const b64 = dataUrl.split(',')[1];
    if (!b64) throw new Error('the canvas came back empty');
    // the downscaled JPEG doubles as the preview, so it renders even when the
    // original format would not have
    return { b64, mime: 'image/jpeg', preview: dataUrl };
  };

  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const shot = draw(bmp, bmp.width, bmp.height);
      bmp.close?.();
      return shot;
    } catch {
      /* fall through to the <img> decoder */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('the browser could not decode this image'));
      el.src = url;
    });
    return draw(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Photo dropzone. Whatever the photo shows goes straight onto the shelf. */
export function UploadZone({ onAddAll }: Props) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const [added, setAdded] = useState<Ingredient[]>([]);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file?: File | null) {
    if (!file || busy) return; // a second photo mid-read would race the first
    setError('');
    setAdded([]);

    // an installed app on iOS can hand back a zero-byte file rather than fail
    if (!file.size) {
      setError('That photo came through empty. Try picking it again.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That photo is enormous. Anything under 25MB is fine.');
      return;
    }

    const real = await sniff(file);
    if (!real.startsWith('image/')) {
      setError('That is not a photo. Pick a picture of your bottles.');
      return;
    }

    setBusy(true);
    let sentRaw = false;
    try {
      let shot: Shot;
      try {
        shot = await shrink(file);
      } catch {
        // The browser could not decode it, which says nothing about whether the
        // model can. It reads HEIC happily, so send the original bytes with the
        // type the bytes actually are rather than stopping here.
        shot = await rawBytes(file);
        shot.mime = real;
        sentRaw = true;
      }

      if (shot.preview) setPreview(shot.preview);
      const res = await identifyImage(shot.b64, shot.mime);

      if (!res.detected.length) {
        setError('Could not make anything out. Try a closer, brighter shot.');
      } else {
        onAddAll(res.detected);
        setAdded(res.detected);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // Once the bytes are away, any failure is the bar's, not the format's.
      // Blaming HEIC there would send people to fix a problem they do not have.
      setError(
        sentRaw
          ? `The bar could not read that photo. ${msg}`.trim()
          : `Could not read that photo. ${msg}`.trim()
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-wrap">
      <div
        className={`dropzone ${drag ? 'drag' : ''} ${busy ? 'busy' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Upload a photo of your shelf"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          hidden
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {preview ? <img className="dz-preview" src={preview} alt="your shelf" /> : <Camera size={26} />}
        <div className="dz-text">
          <strong>{busy ? 'HAVING A LOOK…' : 'SNAP YOUR SHELF'}</strong>
          <span>
            {busy
              ? 'Checking your bottles and bits.'
              : 'Bottles, fruit, whatever\'s lying around. It goes straight onto your shelf.'}
          </span>
        </div>
        {busy && <span className="scanline" aria-hidden />}
      </div>

      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}

      {added.length > 0 && (
        <div className="detected" role="status">
          <div className="detected-head">
            <span className="k-label">SPOTTED AND SHELVED: {added.length}</span>
          </div>
          <div className="chip-row">
            {added.map((d) => (
              <span key={d.name} className="chip chip-added" title={`Spotted as “${d.detectedAs}”`}>
                <IngredientIcon category={d.category} size={18} />
                {d.name}
                <Check size={11} />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
