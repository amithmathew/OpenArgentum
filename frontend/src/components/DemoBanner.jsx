// Slim persistent banner shown whenever the demo database is active.
// Not dismissible on purpose: it's the exit sign for the demo, and it
// disappears on its own once a real database is active.
export default function DemoBanner({ demoMode, onStartSetup }) {
  return (
    <div
      className="flex items-center gap-2 px-3 md:px-6 py-2 text-xs shrink-0"
      style={{
        backgroundColor: 'var(--color-warning-bg)',
        borderBottom: '1px solid var(--color-warning-border)',
        color: 'var(--color-text-secondary)',
      }}
    >
      {demoMode ? (
        <span className="min-w-0">
          <strong style={{ color: 'var(--color-text)' }}>Demo mode</strong> — you're browsing
          sample data; changes reset on restart. To use your own data, restart without the demo
          flag:{' '}
          <code className="px-1 rounded" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
            ./start.sh
          </code>
        </span>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            You're browsing <strong style={{ color: 'var(--color-text)' }}>sample data</strong> —
            changes reset when the server restarts.
          </span>
          <button
            onClick={onStartSetup}
            className="theme-btn-primary px-3 py-1 text-xs whitespace-nowrap shrink-0"
          >
            Set up my data →
          </button>
        </>
      )}
    </div>
  )
}
