import { useState, useRef, useEffect } from 'react'

export default function TypeaheadSelect({ value, options, onChange, placeholder = 'Select...', className = '' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [openUp, setOpenUp] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))

  const handleOpen = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setOpenUp(window.innerHeight - rect.bottom < 200)
    }
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const handleSelect = (val) => {
    onChange(val)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {open ? (
        <input
          ref={inputRef}
          className="theme-input w-full px-2 py-1.5 text-xs"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setSearch('') }
            if (e.key === 'Enter' && filtered.length === 1) { handleSelect(filtered[0].value); }
          }}
          placeholder={`Type to filter...`}
          autoFocus
        />
      ) : (
        <button
          className="theme-input w-full px-2 py-1.5 text-xs text-left flex items-center justify-between gap-1"
          onClick={handleOpen}
        >
          <span className="truncate flex items-center gap-1.5">
            {selected?.color && <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />}
            {selected ? selected.label : <span style={{ color: 'var(--color-text-muted)' }}>{placeholder}</span>}
          </span>
          <svg className="w-3 h-3 shrink-0" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {open && (
        <div className={`absolute z-50 left-0 right-0 rounded-lg shadow-lg overflow-hidden ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="max-h-48 overflow-y-auto py-1">
            {/* "All" / clear option */}
            <button
              onClick={() => handleSelect('')}
              className="w-full px-2 py-1.5 text-xs text-left transition-colors hover:opacity-80"
              style={{ color: !value ? 'var(--color-accent-text)' : 'var(--color-text-muted)' }}
            >
              {placeholder}
            </button>
            {filtered.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className="w-full px-2 py-1.5 text-xs text-left flex items-center gap-1.5 transition-colors hover:opacity-80"
                style={{ color: String(opt.value) === String(value) ? 'var(--color-accent-text)' : 'var(--color-text)' }}
              >
                {opt.color && <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
