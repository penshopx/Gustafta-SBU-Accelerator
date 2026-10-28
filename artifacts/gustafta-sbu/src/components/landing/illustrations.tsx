// Locally authored, decorative scene illustrations for the public landing.
// Purely visual: no seals, stamps or approval marks.
type P = { className?: string };
const B = '#4ea4ff', B2 = '#9ccbff', L = '#2c3d52', D = '#0c121c', D2 = '#13202f';

/** Hero: a building under construction with a crane carrying a folder towards an organised shelf. */
export function SiteScene({ className = '' }: P) {
  return <svg data-testid="illus-site" width="520" aria-hidden="true" focusable="false" viewBox="0 0 520 300" className={`lp-illus ${className}`}>
    <line x1="10" y1="276" x2="510" y2="276" stroke={L} strokeWidth="2" />
    {/* crane */}
    <g stroke={B} strokeWidth="3" fill="none">
      <path d="M90 276V40M110 276V40M90 40h20" />
      {[60, 100, 140, 180, 220, 260].map(y => <path key={y} d={`M90 ${y}l20 20M110 ${y}l-20 20`} strokeWidth="1.5" opacity=".6" />)}
      <path d="M60 40h300M100 40l-10-26h20z" />
      <path d="M60 40l40-26 260 26" strokeWidth="1.5" opacity=".6" />
    </g>
    <rect x="44" y="40" width="22" height="18" fill={L} />
    <g className="lp-swing">
      <line x1="300" y1="40" x2="300" y2="112" stroke={B2} strokeWidth="1.5" />
      <path d="M278 112h44v30h-44z" fill={D2} stroke={B2} strokeWidth="2" />
      <path d="M278 112v-6h16l4 6" fill={D2} stroke={B2} strokeWidth="2" />
      <path d="M286 124h28M286 132h18" stroke={B} strokeWidth="2" />
    </g>
    {/* building frame */}
    <g stroke={L} strokeWidth="2" fill={D}>
      <rect x="150" y="150" width="120" height="126" />
      {[0, 1, 2].map(r => [0, 1, 2].map(c => <rect key={`${r}${c}`} x={162 + c * 36} y={162 + r * 36} width="24" height="22" fill={r === 0 && c === 2 ? B : D2} stroke="none" opacity={r === 0 && c === 2 ? .8 : 1} />))}
    </g>
    <path d="M150 150v-30M270 150v-30M150 120h120" stroke={B2} strokeWidth="2" strokeDasharray="5 5" fill="none" />
    {/* shelf of sorted binders */}
    <g transform="translate(340 170)">
      <rect width="150" height="106" rx="6" fill={D} stroke={L} strokeWidth="2" />
      <path d="M0 52h150" stroke={L} strokeWidth="2" />
      {[0, 1, 2, 3, 4].map(i => <rect key={i} x={12 + i * 26} y="10" width="18" height="38" rx="2" fill={i < 3 ? B : D2} stroke={B2} strokeWidth={i < 3 ? 0 : 1.5} strokeDasharray={i < 3 ? undefined : '3 3'} />)}
      {[0, 1, 2].map(i => <rect key={i} x={12 + i * 26} y="60" width="18" height="38" rx="2" fill={i === 0 ? B2 : D2} stroke={B2} strokeWidth={i === 0 ? 0 : 1.5} strokeDasharray={i === 0 ? undefined : '3 3'} />)}
      <path d="M100 66h36M100 76h28M100 86h32" stroke={L} strokeWidth="3" strokeLinecap="round" />
    </g>
  </svg>;
}

/** How it works: four-stage path from loose pages to a list of actions. */
export function FlowScene({ className = '' }: P) {
  return <svg data-testid="illus-flow" width="100%" aria-hidden="true" focusable="false" viewBox="0 0 1000 120" preserveAspectRatio="xMidYMid meet" className={`lp-illus ${className}`}>
    <path d="M60 60H940" stroke={L} strokeWidth="2" strokeDasharray="6 8" />
    <path className="lp-dash" d="M60 60H940" stroke={B} strokeWidth="2" strokeDasharray="40 960" />
    {/* 1 folder opening */}
    <g transform="translate(95 28)"><path d="M0 8h22l6 8h42v48H0z" fill={D2} stroke={B2} strokeWidth="2" /><path d="M6 24h66l-8 40H0z" fill={B} opacity=".85" /></g>
    {/* 2 loose pages with marks */}
    <g transform="translate(345 22)">{[-8, 4, 14].map((r, i) => <g key={i} transform={`rotate(${r} 30 40) translate(${i * 10} 0)`}><rect width="52" height="68" rx="4" fill={D} stroke={i === 2 ? B : L} strokeWidth="2" /><path d="M10 16h30M10 28h22M10 40h28" stroke={i === 2 ? B2 : L} strokeWidth="3" strokeLinecap="round" /></g>)}</g>
    {/* 3 magnifier over page */}
    <g transform="translate(600 24)"><rect width="56" height="72" rx="4" fill={D} stroke={L} strokeWidth="2" /><path d="M10 16h34M10 28h26M10 40h32M10 52h20" stroke={L} strokeWidth="3" strokeLinecap="round" /><circle cx="50" cy="44" r="18" fill="none" stroke={B} strokeWidth="4" /><path d="M63 57l14 14" stroke={B} strokeWidth="6" strokeLinecap="round" /></g>
    {/* 4 action list with calendar */}
    <g transform="translate(830 24)"><rect width="70" height="72" rx="6" fill={D2} stroke={B2} strokeWidth="2" />{[0, 1, 2].map(i => <g key={i}><rect x="10" y={14 + i * 18} width="10" height="10" rx="2" fill={i === 0 ? B : 'none'} stroke={B} strokeWidth="2" /><path d={`M28 ${19 + i * 18}h30`} stroke={L} strokeWidth="3" strokeLinecap="round" /></g>)}</g>
  </svg>;
}

/** Features: a desk with stacked hard hat, blueprint roll and organised drawers. */
export function DeskScene({ className = '' }: P) {
  return <svg data-testid="illus-desk" width="220" aria-hidden="true" focusable="false" viewBox="0 0 360 200" className={`lp-illus ${className}`}>
    <path d="M10 170h340" stroke={L} strokeWidth="2" />
    <rect x="30" y="100" width="110" height="70" rx="4" fill={D} stroke={L} strokeWidth="2" />
    {[0, 1, 2].map(i => <g key={i}><rect x="38" y={108 + i * 20} width="94" height="16" rx="2" fill={D2} /><rect x="76" y={114 + i * 20} width="18" height="4" rx="2" fill={i === 1 ? B : B2} /></g>)}
    <path d="M58 100a28 24 0 0156 0z" fill={B} /><rect x="50" y="96" width="72" height="6" rx="3" fill={B2} /><path d="M86 76v24" stroke="#0b1a2c" strokeWidth="3" />
    <g transform="translate(160 70)"><rect width="170" height="100" rx="4" fill="#0d1d33" stroke={B} strokeWidth="2" /><g stroke={B2} strokeWidth="1.5" fill="none" opacity=".8"><path d="M20 80V30h60v50M80 50h70v30H20M50 30v50M110 50v30" /><path d="M20 20h60" strokeDasharray="3 3" /></g><path d="M150 0v100" stroke={L} strokeWidth="6" /></g>
    <circle cx="330" cy="70" r="10" fill={D2} stroke={B2} strokeWidth="2" />
  </svg>;
}

/** Output labels: three hands-off lanes — a checker, a draft, and a person reviewing. */
export function ReviewScene({ className = '' }: P) {
  return <svg data-testid="illus-review" width="200" aria-hidden="true" focusable="false" viewBox="0 0 300 220" className={`lp-illus ${className}`}>
    <rect x="20" y="30" width="120" height="160" rx="8" fill={D} stroke={L} strokeWidth="2" />
    <path d="M36 58h70M36 76h88M36 94h56" stroke={L} strokeWidth="4" strokeLinecap="round" />
    <path d="M36 118h88M36 136h60" stroke={B} strokeWidth="4" strokeLinecap="round" strokeDasharray="6 6" />
    <text x="36" y="172" fill={B2} fontFamily="monospace" fontSize="11" letterSpacing="1.5">DRAF</text>
    <circle cx="214" cy="80" r="26" fill={D2} stroke={B2} strokeWidth="2" />
    <path d="M168 190c0-40 20-64 46-64s46 24 46 64z" fill="#0d1d33" stroke={B2} strokeWidth="2" />
    <path d="M190 64a26 18 0 0148 0z" fill={B} /><rect x="184" y="62" width="60" height="6" rx="3" fill={B2} />
    <circle cx="150" cy="120" r="20" fill="none" stroke={B} strokeWidth="4" /><path d="M164 134l16 16" stroke={B} strokeWidth="6" strokeLinecap="round" />
  </svg>;
}

/** Boundary block: a fenced site and a separate distant building — work stays on your side. */
export function BoundaryScene({ className = '' }: P) {
  return <svg data-testid="illus-boundary" width="420" aria-hidden="true" focusable="false" viewBox="0 0 420 130" className={`lp-illus ${className}`}>
    <path d="M0 116h420" stroke={L} strokeWidth="2" />
    <g stroke={B} strokeWidth="2">{[20, 50, 80, 110, 140, 170, 200].map(x => <path key={x} d={`M${x} 116V70`} />)}<path d="M20 80h180M20 104h180" /></g>
    <rect x="60" y="40" width="70" height="76" fill={D2} stroke={B2} strokeWidth="2" /><path d="M72 56h46M72 70h30M72 84h40" stroke={B} strokeWidth="3" strokeLinecap="round" />
    <path d="M230 60h40" stroke={L} strokeWidth="2" strokeDasharray="4 6" />
    <g opacity=".7"><rect x="300" y="30" width="90" height="86" fill={D} stroke={L} strokeWidth="2" /><path d="M296 30l49-20 49 20" fill="none" stroke={L} strokeWidth="2" />{[0, 1, 2].map(i => <rect key={i} x={312 + i * 26} y="48" width="14" height="68" fill={D2} />)}</g>
  </svg>;
}
