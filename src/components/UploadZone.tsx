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

/** Downscale to ≤1024px JPEG so uploads stay small. */
function fileToBase64(file: File): Promise<{ b64: string; mime: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ b64: dataUrl.split(',')[1], mime: 'image/jpeg', preview: url });
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = url;
  });
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
    if (!file || !file.type.startsWith('image/')) return;
    setError('');
    setAdded([]);
    setBusy(true);
    try {
      const { b64, mime, preview } = await fileToBase64(file);
      setPreview(preview);
      const res = await identifyImage(b64, mime);
      if (!res.detected.length) {
        setError('Couldn\'t make anything out. Try a closer, brighter shot.');
      } else {
        onAddAll(res.detected);
        setAdded(res.detected);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identification failed');
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
          accept="image/*"
          hidden
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {preview ? <img className="dz-preview" src={preview} alt="your shelf" /> : <Camera size={26} />}
        <div className="dz-text">
          <strong>{busy ? 'HAVING A LOOK…' : 'SNAP YOUR SHELF'}</strong>
          <span>{busy ? 'Checking your bottles and bits.' : 'Bottles, fruit, whatever\'s lying around. It goes straight onto your shelf.'}</span>
        </div>
        {busy && <span className="scanline" aria-hidden />}
      </div>

      {error && <p className="err" role="alert">{error}</p>}

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
