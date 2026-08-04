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
 * What the bytes actually are, whatever the file calls itself.
 *
 * The name and the MIME type are both hearsay. An iOS photo picked inside an
 * installed app regularly arrives called image.jpg, typed image/jpeg, holding
 * HEIC, which is why this worked in a browser tab and failed in the PWA.
 */
function sniff(head: Uint8Array): string {
  const ascii = (a: number, b: number) => String.fromCharCode(...head.slice(a, b));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 3) === 'GIF') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 2) === 'BM') return 'image/bmp';
  if (ascii(0, 4) === 'II*\0' || ascii(0, 4) === 'MM\0*') return 'image/tiff';
  if (ascii(4, 8) === 'ftyp') return /^avi[fs]/.test(ascii(8, 12)) ? 'image/avif' : 'image/heic';
  // Unrecognised, so not an image as far as we are concerned. Falling back to
  // what the file claimed would let a PDF renamed .jpg through to the model,
  // which answers with a developer's error rather than anything useful.
  return '';
}

/** base64 without FileReader, chunked so a big photo cannot blow the stack */
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/**
 * Get the bytes, before anything can take them away.
 *
 * A picked file is a reference to something the browser is lending us, and an
 * installed app withdraws it fast. NotReadableError, "permission problems that
 * have occurred after a reference to a file was acquired", is the browser
 * saying the loan expired. One retry, because some sandboxes hand it back if
 * asked again immediately.
 */
async function grab(file: File): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    await new Promise((r) => setTimeout(r, 80));
    return new Uint8Array(await file.arrayBuffer());
  }
}

/**
 * Downscale to ≤1024px JPEG so uploads stay small, falling back to the original
 * bytes when the browser cannot decode them but the model can. Works only on
 * the buffer, never on the File: going back for a second read is what kept
 * breaking this in the installed app.
 */
async function decode(bytes: Uint8Array<ArrayBuffer>): Promise<Shot> {
  const mime = sniff(bytes);
  if (!mime) throw new Error('That is not a photo. Pick a picture of your bottles.');

  // rebuild the blob with the type the bytes really are: a decoder handed a
  // HEIC labelled image/jpeg can refuse it on the label alone
  const blob = new Blob([bytes], { type: mime });

  const draw = (src: ImageBitmap | HTMLImageElement, w: number, h: number): Shot => {
    const scale = Math.min(1, 1024 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const b64 = dataUrl.split(',')[1];
    if (!b64) throw new Error('the canvas came back empty');
    return { b64, mime: 'image/jpeg', preview: dataUrl };
  };

  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const shot = draw(bmp, bmp.width, bmp.height);
      bmp.close?.();
      return shot;
    } catch {
      /* fall through */
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('undecodable'));
      el.src = url;
    });
    return draw(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } catch {
    // the browser cannot read it; the vision model very likely can
    return { b64: toBase64(bytes), mime, preview: '' };
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

    // Read first, argue later. Every state update below re-renders, and the
    // input gets cleared the moment this returns; either can pull the file out
    // from under us before a byte has been read.
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await grab(file);
    } catch {
      setError('The app lost hold of that photo. Pick it again, or save it to Files first and choose it from there.');
      return;
    }

    setError('');
    setAdded([]);

    if (!bytes.length) {
      setError('That photo came through empty. Try picking it again.');
      return;
    }
    if (bytes.length > MAX_BYTES) {
      setError('That photo is enormous. Anything under 25MB is fine.');
      return;
    }

    setBusy(true);
    try {
      const shot = await decode(bytes);
      if (shot.preview) setPreview(shot.preview);
      const res = await identifyImage(shot.b64, shot.mime);

      if (!res.detected.length) {
        setError('Could not make anything out. Try a closer, brighter shot.');
      } else {
        onAddAll(res.detected);
        setAdded(res.detected);
      }
    } catch (err) {
      const msg = (err instanceof Error ? err.message : '').trim();
      // server errors already read as a sentence; only the bare ones need a lead
      setError(/^[A-Z]/.test(msg) ? msg : `Could not read that photo. ${msg}`.trim());
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
          onChange={async (e) => {
            const input = e.target;
            // clearing the input revokes the file handle, so wait until the
            // bytes are safely in memory before letting it go
            await handleFile(input.files?.[0]);
            input.value = '';
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
