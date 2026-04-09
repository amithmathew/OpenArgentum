export default function AppLogo({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 112" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Shield shape */}
      <path
        d="M50 2 L95 20 Q98 21 98 24 L98 52 Q98 80 50 110 Q2 80 2 52 L2 24 Q2 21 5 20 Z"
        fill="#1e293b"
      />
      {/* Letter A */}
      <text
        x="50" y="74"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="62"
        fill="white"
        letterSpacing="-2"
      >A</text>
    </svg>
  )
}
