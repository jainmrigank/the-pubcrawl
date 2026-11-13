export function GlassDrawing({ kind = 'coupe', garnish = 'none', cream = false, className = '' }: {
  kind?: 'coupe' | 'rocks' | 'tall' | 'wine' | 'flute';
  garnish?: 'none' | 'peel' | 'salt' | 'cherry';
  cream?: boolean;
  className?: string;
}) {
  return <svg className={'bar-glass-drawing ' + className} viewBox="0 0 140 160" fill="none" aria-hidden="true">
    {kind === 'rocks' ? <>
      <path d="M29 40 35 135Q70 149 105 135L111 40Z" fill="currentColor" fillOpacity=".025" stroke="currentColor" strokeWidth="1.4" />
      <path d="M33 76Q70 86 107 76L103 130Q70 140 37 130Z" fill="var(--accent)" fillOpacity=".26" />
      <ellipse cx="70" cy="40" rx="41" ry="10" stroke="currentColor" strokeWidth="1.4" />
      <rect x="48" y="64" width="39" height="39" rx="5" transform="rotate(13 68 83)" stroke="currentColor" strokeOpacity=".4" />
      {cream && <path d="M32 65Q70 72 108 65L106 87Q70 102 34 87Z" fill="#e6d6b8" fillOpacity=".62" />}
      {garnish === 'peel' && <path d="M104 58A24 24 0 0 0 80 25" stroke="var(--accent)" strokeWidth="4" />}
    </> : kind === 'flute' ? <>
      <path d="M51 20Q44 91 70 110Q96 91 89 20Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M50 49H90Q92 91 70 108Q48 91 50 49Z" fill="var(--accent)" fillOpacity=".16" />
      <ellipse cx="70" cy="20" rx="19" ry="5" stroke="currentColor" />
      <path d="M70 110V140L48 150Q70 156 92 150L70 140" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="64" cy="72" r="2" stroke="currentColor" strokeOpacity=".4" /><circle cx="76" cy="92" r="2" stroke="currentColor" strokeOpacity=".4" />
      <path d="M91 28Q72 20 82 38Q91 49 84 55" stroke="var(--accent)" strokeWidth="2" />
    </> : kind === 'tall' ? <>
      <path d="M40 22 44 139Q70 149 96 139L100 22Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M43 60H97L94 136Q70 142 46 136Z" fill="var(--accent)" fillOpacity=".24" />
      <ellipse cx="70" cy="22" rx="30" ry="7" stroke="currentColor" />
      <path d="M78 100 102 5" stroke="currentColor" /><path d="M50 80 73 70 84 91 61 103ZM55 43 80 40 84 62 59 65Z" stroke="currentColor" strokeOpacity=".35" />
      <circle cx="44" cy="35" r="18" stroke="var(--accent)" /><path d="M44 19V51M29 35H59" stroke="var(--accent)" />
    </> : <>
      {kind === 'wine' ? <>
        <path d="M35 28C20 89 39 110 70 110C101 110 120 89 105 28" fill="currentColor" fillOpacity=".03" stroke="currentColor" strokeWidth="1.4" />
        <path d="M32 65H108Q109 108 70 108Q31 108 32 65Z" fill="var(--accent)" fillOpacity=".3" />
        <ellipse cx="70" cy="28" rx="35" ry="9" stroke="currentColor" />
      </> : <>
        <path d="M13 42 70 101 127 42" stroke="currentColor" strokeWidth="1.4" />
        <path d="M27 56H113L70 99Z" fill="var(--accent)" fillOpacity=".27" />
        <ellipse cx="70" cy="42" rx="57" ry="11" stroke="currentColor" strokeWidth="1.4" />
        {garnish === 'cherry' && <><path d="M88 57Q100 33 111 25" stroke="currentColor" /><circle cx="88" cy="57" r="5" fill="var(--accent)" /></>}
        {garnish === 'salt' && <path d="M13 42Q35 23 70 31" stroke="currentColor" strokeWidth="3" strokeDasharray="1 3" />}
        {garnish === 'peel' && <path d="M104 35Q84 25 92 41Q110 54 98 64" stroke="var(--accent)" strokeWidth="2" />}
      </>}
      <path d={'M70 ' + (kind === 'wine' ? '110' : '101') + 'V139M70 139 40 149Q70 155 100 149Z'} stroke="currentColor" strokeWidth="1.4" />
    </>}
  </svg>;
}
