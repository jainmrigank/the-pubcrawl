const owners = new Map<string, number>();
let originalOverflow = '';
let originalOverscroll = '';

export function acquirePageScrollLock(owner: string): () => void {
  if (!owner || typeof document === 'undefined') return () => {};
  if (owners.size === 0) {
    originalOverflow = document.body.style.overflow;
    originalOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
  }
  owners.set(owner, (owners.get(owner) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releasePageScrollLock(owner);
  };
}

function releasePageScrollLock(owner: string) {
  const count = owners.get(owner) ?? 0;
  if (count > 1) owners.set(owner, count - 1);
  else owners.delete(owner);
  if (owners.size > 0 || typeof document === 'undefined') return;
  document.body.style.overflow = originalOverflow;
  document.body.style.overscrollBehavior = originalOverscroll;
}
