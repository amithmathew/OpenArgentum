export default function AureliaIcon({ size = 28, mono = false, className = '' }) {
  const bubbleColor = mono ? 'currentColor' : '#d4883c'
  const sparkleColor = mono ? 'var(--color-nav-bg, white)' : 'white'
  return (
    <svg width={size} height={size} viewBox="0 0 100 90" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Speech bubble */}
      <path
        d="M5 18 C5 4 20 4 35 4 L65 4 C80 4 95 4 95 18 L95 52 C95 66 80 66 65 66 L35 66 L16 84 L20 66 C10 64 5 60 5 52 Z"
        fill={bubbleColor}
      />
      {/* Main 4-point sparkle */}
      <g transform="translate(50, 35)">
        <path
          d="M0 -18 C2 -5 5 -2 18 0 C5 2 2 5 0 18 C-2 5 -5 2 -18 0 C-5 -2 -2 -5 0 -18Z"
          fill={sparkleColor}
        />
      </g>
      {/* Small accent sparkle */}
      <g transform="translate(74, 18)">
        <path
          d="M0 -6 C1 -2 2 -1 6 0 C2 1 1 2 0 6 C-1 2 -2 1 -6 0 C-2 -1 -1 -2 0 -6Z"
          fill={sparkleColor}
          opacity="0.7"
        />
      </g>
    </svg>
  )
}
