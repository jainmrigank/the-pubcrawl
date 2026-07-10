import { useState } from 'react';

/** Small ingredient thumbnail; falls back to a bordered mono initial when no image exists. */
export function IngredientIcon({ name, image, size = 24 }: { name: string; image?: string; category?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!image || broken)
    return (
      <span className="ing-letter" style={{ width: size, height: size, fontSize: size * 0.5 }}>
        {name.trim().charAt(0).toUpperCase()}
      </span>
    );
  return (
    <img
      className="ing-img"
      src={image}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
