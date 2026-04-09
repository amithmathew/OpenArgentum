import { useState, useEffect, useRef, useCallback } from 'react'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import InstitutionIcon from '../components/InstitutionIcon'
import TypeaheadSelect from '../components/TypeaheadSelect'
import TransactionNotes from '../components/TransactionNotes'
import useIsMobile from '../hooks/useIsMobile'

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) || 0
  const g = parseInt(h.substring(2, 4), 16) || 0
  const b = parseInt(h.substring(4, 6), 16) || 0
  return `rgba(${r},${g},${b},${alpha})`
}

function formatAmount(cents) {
  const dollars = Math.abs(cents) / 100
  const formatted = dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cents < 0 ? `-$${formatted}` : `$${formatted}`
}

function FilterBar({ filters, setFilters, categories, tiers, accounts, tags, projects, onClear }) {
  return (
    <div className="theme-card p-3 mb-4 flex flex-col md:flex-row md:flex-wrap gap-2">
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>From</span>
          <input type="date" className="theme-input px-2 py-1.5 text-xs" max={new Date().toISOString().slice(0, 10)} value={filters.date_from || ''} onChange={e => setFilters({...filters, date_from: e.target.value || undefined})} />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>To</span>
          <input type="date" className="theme-input px-2 py-1.5 text-xs" max={new Date().toISOString().slice(0, 10)} value={filters.date_to || ''} onChange={e => setFilters({...filters, date_to: e.target.value || undefined})} />
        </label>
      </div>
      <input type="text" className="theme-input px-2 py-1.5 text-xs flex-1 min-w-[120px]" value={filters.search || ''} onChange={e => setFilters({...filters, search: e.target.value || undefined})} placeholder="Search..." />
      <div className="flex flex-wrap gap-2">
        <TypeaheadSelect className="w-full md:w-36"
          value={filters.category_id || ''} placeholder="All categories"
          options={categories.map(c => ({ value: c.id, label: c.name }))}
          onChange={v => setFilters({...filters, category_id: v || undefined})} />
        <TypeaheadSelect className="w-full md:w-32"
          value={filters.tier_id || ''} placeholder="All tiers"
          options={tiers.map(t => ({ value: t.id, label: t.name, color: t.color }))}
          onChange={v => setFilters({...filters, tier_id: v || undefined})} />
        <TypeaheadSelect className="w-full md:w-32"
          value={filters.tag_id || ''} placeholder="All tags"
          options={tags.map(t => ({ value: t.id, label: t.name, color: t.color }))}
          onChange={v => setFilters({...filters, tag_id: v || undefined})} />
        <TypeaheadSelect className="w-full md:w-36"
          value={filters.account_id || ''} placeholder="All accounts"
          options={accounts.map(a => ({ value: a.id, label: a.name }))}
          onChange={v => setFilters({...filters, account_id: v || undefined})} />
        {projects.length > 0 && (
          <TypeaheadSelect className="w-full md:w-36"
            value={filters.project_id || ''} placeholder="All projects"
            options={projects.map(p => ({ value: p.id, label: p.name, color: p.color }))}
            onChange={v => setFilters({...filters, project_id: v || undefined})} />
        )}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select className="theme-input px-2 py-1.5 text-xs" value={filters.is_transfer ?? ''} onChange={e => setFilters({...filters, is_transfer: e.target.value === '' ? undefined : e.target.value})}>
          <option value="">All types</option>
          <option value="false">Expenses/Income</option>
          <option value="true">Transfers</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
          <input type="checkbox" checked={!!filters.show_hidden} onChange={e => setFilters({...filters, show_hidden: e.target.checked || undefined})} className="rounded" />
          Show hidden
        </label>
        <button onClick={onClear} className="theme-btn-secondary px-3 py-1.5 text-xs">Clear</button>
      </div>
    </div>
  )
}

// Golden angle palette for auto-generating visually distinct colors
const TAG_PALETTE = [
  '#e06060', '#4caf7c', '#5b8def', '#e8a040', '#8b7ec8',
  '#e88090', '#40b0a0', '#c06ac0', '#7aaa4a', '#d07840',
  '#6090d0', '#c8a040', '#50b8b8', '#d06080', '#80a060',
  '#a070e0', '#e0a070', '#50a0e0', '#d0a0b0', '#70c070',
]

function generateTagColor(existingColors) {
  // Pick the palette color most distant from existing ones
  const used = new Set(existingColors.map(c => c?.toLowerCase()))
  for (const color of TAG_PALETTE) {
    if (!used.has(color)) return color
  }
  // Fallback: golden angle hue rotation
  const hue = (existingColors.length * 137.508) % 360
  return `hsl(${Math.round(hue)}, 55%, 55%)`
}

function InlineTagPicker({ txnId, currentTagIds, tags, isVisible }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const pickerRef = useRef(null)
  const inputRef = useRef(null)
  const currentIds = new Set((currentTagIds || '').split(',').filter(Boolean).map(Number))

  // Click outside to dismiss
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const toggleTag = async (tagId) => {
    try {
      if (currentIds.has(tagId)) {
        await api.post('/tags/unassign', { transaction_ids: [txnId], tag_id: tagId })
      } else {
        await api.post('/tags/assign', { transaction_ids: [txnId], tag_id: tagId })
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    } catch {}
    setSearch('')
  }

  const createAndAssign = async (name) => {
    try {
      const color = generateTagColor(tags.map(t => t.color))
      const newTag = await api.post('/tags', { name, color })
      await api.post('/tags/assign', { transaction_ids: [txnId], tag_id: newTag.id })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    } catch {}
    setSearch('')
  }

  const filtered = tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
  const exactMatch = tags.some(t => t.name.toLowerCase() === search.trim().toLowerCase())
  const showCreate = search.trim().length > 0 && !exactMatch

  if (!open) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className={`flex items-center gap-0.5 rounded-full text-[10px] font-medium px-1.5 py-0 transition-opacity will-change-[opacity] ${isVisible ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}
        style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-muted)', border: isVisible ? '1px solid var(--color-border-light)' : 'none' }}
        title="Add/remove tags"
      >+ tag</button>
    )
  }

  return (
    <div className="inline-block ml-1 relative" ref={pickerRef} onClick={e => e.stopPropagation()}>
      <button
        className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium"
        style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-text)', border: '1px solid var(--color-accent)' }}
      >+ tag</button>
      <div className="absolute z-20 top-full left-0 mt-1 w-52 rounded-lg shadow-lg overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="px-2 py-1.5" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
          <input
            ref={inputRef}
            className="theme-input w-full px-2 py-1 text-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && showCreate) { e.preventDefault(); createAndAssign(search.trim()) }
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="Search or create tag..."
          />
        </div>
        <div className="max-h-48 overflow-y-auto py-1">
          {filtered.map(tag => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:opacity-80"
              style={{ color: 'var(--color-text)' }}
            >
              <div className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                style={{ borderColor: tag.color, backgroundColor: currentIds.has(tag.id) ? tag.color : 'transparent' }}>
                {currentIds.has(tag.id) && <span className="text-white text-[8px]">✓</span>}
              </div>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="truncate">{tag.name}</span>
            </button>
          ))}
          {showCreate && (
            <button
              onClick={() => createAndAssign(search.trim())}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left"
              style={{ color: 'var(--color-accent-text)' }}
            >
              <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-[10px]">+</span>
              <span>Create "<strong>{search.trim()}</strong>"</span>
            </button>
          )}
          {filtered.length === 0 && !showCreate && (
            <div className="px-2 py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>No tags found</div>
          )}
        </div>
      </div>
    </div>
  )
}

function TransactionRow({ txn, categories, tiers, projects, tags, selected, onToggleSelect, onUpdate, onReviewTransfer, expanded, onToggleExpand, onFilterByTag, isMobile }) {
  const effectiveTierId = txn.tier_id || categories.find(c => c.id === txn.category_id)?.default_tier_id
  const tierObj = tiers.find(t => t.id === effectiveTierId)
  const catObj = categories.find(c => c.id === txn.category_id)
  const isUncategorized = !!!txn.is_transfer && !txn.category_id

  const handleRowClick = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'OPTION') return
    onToggleExpand(txn.id)
  }

  return (
    <div className="group/row" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
      {isMobile ? (
      /* Mobile: stacked card layout */
      <div
        className="px-3 py-2.5 cursor-pointer transition-colors"
        style={{ backgroundColor: txn.needs_review ? 'var(--color-warning-bg)' : undefined }}
        onClick={handleRowClick}
      >
        {/* Line 1: icon + description + amount */}
        <div className="flex items-center gap-2">
          <InstitutionIcon institution={txn.account_institution} iconUrl={txn.account_icon_url} size={18} className="shrink-0" />
          <span className="font-medium text-sm truncate flex-1 min-w-0" style={{ color: 'var(--color-text)' }}>
            {txn.description}
          </span>
          {!!txn.is_transfer && !!txn.needs_review && (
            <span className="theme-badge shrink-0 text-[10px]" style={{ backgroundColor: 'var(--color-badge-transfer-bg)', color: 'var(--color-badge-transfer-text)' }}>Transfer?</span>
          )}
          {!!txn.is_suspected_duplicate && (
            <span className="theme-badge shrink-0 text-[10px]" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>Dup?</span>
          )}
          <span className={`shrink-0 font-mono text-sm font-medium tabular-nums ${txn.amount_cents < 0 ? 'amount-expense' : 'amount-income'}`}>
            {formatAmount(txn.amount_cents)}
          </span>
        </div>
        {/* Line 2: date · category · tier + tags + projects */}
        <div className="flex items-center gap-1 mt-1 text-xs flex-wrap max-h-14 overflow-hidden" style={{ color: 'var(--color-text-muted)' }}>
          <span>{txn.date}</span>
          {catObj && <span>· {catObj.name}</span>}
          {tierObj && (
            <span className="inline-flex items-center">
              <span className="mr-0.5">·</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5 shrink-0" style={{ backgroundColor: tierObj.color }} />
              {tierObj.name}
            </span>
          )}
          {!!txn.is_transfer && !!!txn.needs_review && (
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--color-transfer)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          )}
          {txn.tag_ids && txn.tag_ids.split(',').map(tid => {
            const tag = tags.find(t => t.id === parseInt(tid))
            return tag ? (
              <button key={'t' + tid} className="rounded-md px-1.5 py-0.5 text-[11px] font-medium cursor-pointer hover:opacity-80"
                style={{ backgroundColor: hexToRgba(tag.color, 0.13), color: tag.color, border: `1px solid ${hexToRgba(tag.color, 0.25)}` }}
                onClick={(e) => { e.stopPropagation(); if (onFilterByTag) onFilterByTag(tag.id) }}
              >{tag.name}</button>
            ) : null
          })}
          {txn.project_ids && txn.project_ids.split(',').map(pid => {
            const proj = projects.find(p => p.id === parseInt(pid))
            return proj ? (
              <span key={'p' + pid} className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: 'transparent', color: proj.color, border: `1px solid ${hexToRgba(proj.color, 0.3)}` }}>
                {proj.name}
              </span>
            ) : null
          })}
        </div>
      </div>
      ) : (
      /* Desktop: CSS Grid for strict alignment */
      <div
        className="grid items-start px-4 py-2.5 cursor-pointer"
        style={{
          gridTemplateColumns: '32px 20px 1fr minmax(110px, auto) minmax(80px, auto) 100px',
          gap: '0 12px',
          backgroundColor: txn.needs_review ? 'var(--color-warning-bg)' : undefined,
        }}
        onClick={handleRowClick}
      >
        {/* Checkbox */}
        <div className="flex items-center justify-center self-center cursor-pointer" onClick={e => { e.stopPropagation(); onToggleSelect(txn.id) }}>
          <input type="checkbox" checked={selected} readOnly className="rounded w-4 h-4 pointer-events-none" />
        </div>

        {/* Institution icon or date-based icon */}
        <div className="flex justify-center self-center">
          <InstitutionIcon institution={txn.account_institution} iconUrl={txn.account_icon_url} size={18} />
        </div>

        {/* Description block */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate" style={{ color: 'var(--color-text)' }}>
              {txn.description}
            </span>
            {!!txn.is_transfer && !!!txn.needs_review && (
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--color-transfer)' }} title="Transfer">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            )}
            {!!txn.is_transfer && !!txn.needs_review && (
              <span className="theme-badge shrink-0" style={{ backgroundColor: 'var(--color-badge-transfer-bg)', color: 'var(--color-badge-transfer-text)' }}>Transfer?</span>
            )}
            {!!txn.is_suspected_duplicate && (
              <span className="theme-badge shrink-0" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>Duplicate?</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs leading-4 min-h-4" style={{ color: 'var(--color-text-muted)' }}>
            <span>{txn.date}</span>
            {catObj && <span>· {catObj.name}</span>}
            {tierObj && (
              <span className="flex items-center">
                <span className="mr-0.5">·</span>
                <span className="w-1.5 h-1.5 rounded-full mr-1 shrink-0" style={{ backgroundColor: tierObj.color }} />
                {tierObj.name}
              </span>
            )}
            {txn.tag_ids && txn.tag_ids.split(',').map(tid => {
              const tag = tags.find(t => t.id === parseInt(tid))
              return tag ? (
                <button key={'t' + tid} className="theme-badge ml-1 cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: hexToRgba(tag.color, 0.13), color: tag.color }}
                  onClick={(e) => { e.stopPropagation(); if (onFilterByTag) onFilterByTag(tag.id) }}
                  title={`Filter by tag: ${tag.name}`}
                >{tag.name}</button>
              ) : null
            })}
            {txn.project_ids && txn.project_ids.split(',').map(pid => {
              const proj = projects.find(p => p.id === parseInt(pid))
              return proj ? (
                <span key={pid} className="theme-badge ml-1" style={{ backgroundColor: 'transparent', color: proj.color, border: `1px solid ${proj.color}44` }}>
                  <svg className="w-2.5 h-2.5 mr-0.5 inline-block -mt-px" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/></svg>
                  {proj.name}
                </span>
              ) : null
            })}
            <InlineTagPicker txnId={txn.id} currentTagIds={txn.tag_ids} tags={tags} onUpdate={onUpdate} />
            {txn.note_count > 0 && (
              <span className="theme-badge ml-1" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}>
                <svg className="w-2.5 h-2.5 mr-0.5 inline-block -mt-px" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v8a1 1 0 01-1 1H5l-3 3V3z"/></svg>
                {txn.note_count}
              </span>
            )}
          </div>
        </div>

        {/* Category + Tier dropdowns — hidden for confirmed transfers */}
        {txn.is_transfer && !txn.needs_review ? (
          <>
            <div className="text-xs self-center" style={{ color: 'var(--color-text-muted)' }}>—</div>
            <div className="text-xs self-center" style={{ color: 'var(--color-text-muted)' }}>—</div>
          </>
        ) : (
          <>
            <div className="self-center" onClick={e => e.stopPropagation()}>
              <select
                className="theme-input w-full px-2 py-1 text-xs"
                style={isUncategorized ? { borderColor: 'var(--color-warning)', backgroundColor: 'var(--color-warning-bg)' } : undefined}
                value={txn.category_id || ''}
                onChange={e => onUpdate(txn.id, { category_id: parseInt(e.target.value) || null })}
              >
                <option value="">{isUncategorized ? 'Select...' : '—'}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="self-center" onClick={e => e.stopPropagation()}>
              <select
                className="theme-input w-full px-2 py-1 text-xs"
                value={txn.tier_id || effectiveTierId || ''}
                onChange={e => onUpdate(txn.id, { tier_id: parseInt(e.target.value) || null })}
              >
                <option value="">—</option>
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </>
        )}

        {/* Amount */}
        <div className={`self-center text-right font-mono text-sm font-medium tabular-nums ${txn.amount_cents < 0 ? 'amount-expense' : 'amount-income'}`}>
          {formatAmount(txn.amount_cents)}
        </div>
      </div>
      )}

      {/* Expandable detail pane */}
      {expanded && (
        <div className="px-3 md:px-4 pb-3 pt-1" style={{ paddingLeft: isMobile ? 12 : 60, backgroundColor: 'var(--color-surface-alt)' }}>
          {/* Mobile: category/tier dropdowns in detail pane */}
          {isMobile && !(txn.is_transfer && !txn.needs_review) && (
            <div className="flex gap-2 mb-2" onClick={e => e.stopPropagation()}>
              <select
                className="theme-input flex-1 px-2 py-1.5 text-xs"
                style={isUncategorized ? { borderColor: 'var(--color-warning)', backgroundColor: 'var(--color-warning-bg)' } : undefined}
                value={txn.category_id || ''}
                onChange={e => onUpdate(txn.id, { category_id: parseInt(e.target.value) || null })}
              >
                <option value="">{isUncategorized ? 'Select category...' : '— Category —'}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                className="theme-input flex-1 px-2 py-1.5 text-xs"
                value={txn.tier_id || effectiveTierId || ''}
                onChange={e => onUpdate(txn.id, { tier_id: parseInt(e.target.value) || null })}
              >
                <option value="">— Tier —</option>
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 md:gap-x-8 gap-y-1 text-xs" style={{ maxWidth: isMobile ? '100%' : 500 }}>
            {txn.account_name && (
              <>
                <span style={{ color: 'var(--color-text-muted)' }}>Account</span>
                <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  <InstitutionIcon institution={txn.account_institution} iconUrl={txn.account_icon_url} size={14} />
                  {txn.account_name}
                </span>
              </>
            )}
            {txn.description_raw && (
              <>
                <span style={{ color: 'var(--color-text-muted)' }}>Raw description</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{txn.description_raw}</span>
              </>
            )}
            <span style={{ color: 'var(--color-text-muted)' }}>Status</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {txn.categorization_status === 'manual' ? 'Manually categorized' : txn.categorization_status === 'auto' ? 'Auto-categorized' : 'Pending'}
            </span>
            {txn.reference && (
              <>
                <span style={{ color: 'var(--color-text-muted)' }}>Reference</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{txn.reference}</span>
              </>
            )}
            {txn.balance_cents != null && (
              <>
                <span style={{ color: 'var(--color-text-muted)' }}>Balance</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{formatAmount(txn.balance_cents)}</span>
              </>
            )}
            {txn.statement_id && (
              <>
                <span style={{ color: 'var(--color-text-muted)' }}>Source</span>
                <a href={`/api/statements/${txn.statement_id}/file`} target="_blank" rel="noopener noreferrer"
                   className="hover:underline" style={{ color: 'var(--color-accent-text)' }}>
                  {txn.statement_filename || 'View source'}
                </a>
              </>
            )}
          </div>
          {/* Transfer review actions in detail pane */}
          {!!txn.is_transfer && !!txn.needs_review && (
            <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Is this a transfer?</span>
              <button onClick={() => onReviewTransfer([txn.id], true)} className="theme-btn-primary px-3 py-1 text-xs">Yes, exclude from {txn.amount_cents >= 0 ? 'income' : 'spending'}</button>
              <button onClick={() => onReviewTransfer([txn.id], false)} className="theme-btn-secondary px-3 py-1 text-xs">No, categorize it</button>
            </div>
          )}
          {/* Duplicate review */}
          {!!txn.is_suspected_duplicate && txn.dup_original_date && (
            <div className="mt-2 pt-2 text-xs" style={{ borderTop: '1px solid var(--color-border-light)' }}>
              <div className="font-medium mb-1.5" style={{ color: 'var(--color-warning)' }}>Possible duplicate of:</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Date</span>
                <span>{txn.dup_original_date}</span>

                <span style={{ color: 'var(--color-text-muted)' }}>Description</span>
                <span>{txn.dup_original_description}</span>

                <span style={{ color: 'var(--color-text-muted)' }}>Amount</span>
                <span className="font-mono">{formatAmount(txn.dup_original_amount)}</span>

                <span style={{ color: 'var(--color-text-muted)' }}>Source</span>
                <a href={`/api/statements/${txn.dup_original_statement_id}/file`} target="_blank" rel="noopener noreferrer"
                  className="hover:underline" style={{ color: 'var(--color-accent-text)' }}>
                  {txn.dup_original_statement}
                </a>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { api.post('/transactions/resolve-duplicate', { transaction_id: txn.id, action: 'hide' }).then(() => onUpdate(txn.id, {})) }}
                  className="theme-btn-primary px-3 py-1 text-xs">Hide this duplicate</button>
                <button onClick={() => { api.post('/transactions/resolve-duplicate', { transaction_id: txn.id, action: 'keep' }).then(() => onUpdate(txn.id, {})) }}
                  className="theme-btn-secondary px-3 py-1 text-xs">Keep both</button>
              </div>
            </div>
          )}
          {/* Transaction notes */}
          <TransactionNotes transactionId={txn.id} />
        </div>
      )}
    </div>
  )
}

function useSearchParamsFilters() {
  const [searchParams] = useSearchParams()
  const filterKeys = ['date_from', 'date_to', 'category_id', 'tier_id', 'tag_id', 'project_id', 'account_id', 'search', 'is_transfer', 'needs_review']
  const filters = {}
  for (const key of filterKeys) {
    const val = searchParams.get(key)
    if (val) filters[key] = val
  }
  return { filters, key: searchParams.toString() }
}

export default function Transactions() {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const { filters: urlFilters, key: urlKey } = useSearchParamsFilters()
  const [filters, setFilters] = useState(urlFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Update filters when URL search params change (e.g., from chat navigation)
  useEffect(() => {
    if (Object.keys(urlFilters).length > 0) {
      setFilters(urlFilters)
      setQuickFilter('all')
    }
  }, [urlKey])
  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState(new Set())
  const [expandedId, setExpandedId] = useState(null)
  const perPage = 50
  const sentinelRef = useRef(null)

  const baseParams = { ...filters, sort_by: sortBy, sort_dir: sortDir, per_page: perPage }
  Object.keys(baseParams).forEach(k => baseParams[k] === undefined && delete baseParams[k])

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['transactions', baseParams],
    queryFn: ({ pageParam = 1 }) => api.get('/transactions', { ...baseParams, page: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    placeholderData: (prev) => prev, // Keep previous data while refetching
  })

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage() },
      { threshold: 0.1 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories') })
  const { data: tiers = [] } = useQuery({ queryKey: ['tiers'], queryFn: () => api.get('/tiers') })
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => api.get('/projects') })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: () => api.get('/tags') })
  const { data: pendingData } = useQuery({ queryKey: ['pending-count'], queryFn: () => api.get('/transactions/pending-count') })
  const pendingCount = pendingData?.count || 0

  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const showToast = useCallback((message) => {
    setToast(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const updateTxn = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/transactions/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  })
  const categorizeMutation = useMutation({
    mutationFn: (body) => api.post('/transactions/categorize', body),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] }); queryClient.invalidateQueries({ queryKey: ['categories'] }); queryClient.invalidateQueries({ queryKey: ['pending-count'] })
      const n = vars.transaction_ids?.length || 0
      showToast(vars.all ? 'Auto-categorizing all transactions...' : `Auto-categorized ${n} transaction${n !== 1 ? 's' : ''}`)
    },
  })
  const bulkUpdateMutation = useMutation({
    mutationFn: (body) => api.post('/transactions/bulk-update', body),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      const n = vars.transaction_ids?.length || 0
      if (vars.category_id) {
        const cat = categories.find(c => c.id === vars.category_id)
        showToast(`Set category to "${cat?.name || '?'}" for ${n} transaction${n !== 1 ? 's' : ''}`)
      } else if (vars.tier_id) {
        const tier = tiers.find(t => t.id === vars.tier_id)
        showToast(`Set tier to "${tier?.name || '?'}" for ${n} transaction${n !== 1 ? 's' : ''}`)
      } else if (vars.is_transfer !== undefined) {
        showToast(`Marked ${n} transaction${n !== 1 ? 's' : ''} as transfer${n !== 1 ? 's' : ''}`)
      } else if (vars.needs_review === false) {
        showToast(`Reviewed ${n} transaction${n !== 1 ? 's' : ''}`)
      } else {
        showToast(`Updated ${n} transaction${n !== 1 ? 's' : ''}`)
      }
    },
  })
  const assignProjectMutation = useMutation({
    mutationFn: ({ projectId, txnIds }) => api.post('/projects/assign', { transaction_ids: txnIds, project_id: projectId }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] }); queryClient.invalidateQueries({ queryKey: ['projects'] })
      const proj = projects.find(p => p.id === vars.projectId)
      showToast(`Added ${vars.txnIds.length} transaction${vars.txnIds.length !== 1 ? 's' : ''} to "${proj?.name || '?'}"`)
    },
  })
  const assignTagMutation = useMutation({
    mutationFn: ({ tagId, txnIds }) => api.post('/tags/assign', { transaction_ids: txnIds, tag_id: tagId }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] }); queryClient.invalidateQueries({ queryKey: ['tags'] })
      const tag = tags.find(t => t.id === vars.tagId)
      showToast(`Tagged ${vars.txnIds.length} transaction${vars.txnIds.length !== 1 ? 's' : ''} as "${tag?.name || '?'}"`)
    },
  })

  const transactions = data?.pages?.flatMap(p => p.items) || []
  const total = data?.pages?.[0]?.total || 0
  const totalSpend = data?.pages?.[0]?.total_spend || 0
  const totalIncome = data?.pages?.[0]?.total_income || 0
  const monthlySubtotals = data?.pages?.[0]?.monthly_subtotals || {}

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }
  const toggleSelect = (id) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next) }
  const selectAll = () => { if (selected.size === transactions.length) setSelected(new Set()); else setSelected(new Set(transactions.map(t => t.id))) }

  const transferReviewCount = transactions.filter(t => t.is_transfer && t.needs_review).length
  const duplicateCount = transactions.filter(t => !!t.is_suspected_duplicate).length
  const uncategorizedCount = transactions.filter(t => !t.category_id && !t.is_transfer && !t.is_hidden).length

  const [quickFilter, setQuickFilter] = useState('all')

  const applyQuickFilter = (preset) => {
    setQuickFilter(preset)
    if (preset === 'needs-action') setFilters({ needs_review: 'true' })
    else if (preset === 'transfers') setFilters({ is_transfer: 'true' })
    else if (preset === 'duplicates') setFilters({}) // client-side filter
    else if (preset === 'uncategorized') setFilters({}) // client-side filter
    else setFilters({})
  }

  const isActiveTab = (id) => id === quickFilter

  // Client-side filters for duplicates and uncategorized
  const displayTransactions = quickFilter === 'duplicates'
    ? transactions.filter(t => !!t.is_suspected_duplicate)
    : quickFilter === 'uncategorized'
    ? transactions.filter(t => !t.category_id && !t.is_transfer && !t.is_hidden)
    : transactions

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Transactions</h2>
      </div>

      {/* Quick filter tabs */}
      <div className="flex gap-1.5 md:gap-2 mb-3 overflow-x-auto">
        {[
          { id: 'all', label: 'All' },
          { id: 'needs-action', label: 'Needs Review', count: transferReviewCount },
          { id: 'uncategorized', label: 'Uncategorized', count: uncategorizedCount },
          { id: 'duplicates', label: 'Duplicates', count: duplicateCount },
          { id: 'transfers', label: 'Transfers' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => applyQuickFilter(tab.id)}
            className="px-3 py-2 md:py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0"
            style={{
              backgroundColor: isActiveTab(tab.id) ? 'var(--color-accent-light)' : 'var(--color-surface)',
              color: isActiveTab(tab.id) ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-light)',
            }}
          >
            {tab.label}{tab.count > 0 ? ` (${tab.count})` : ''}
          </button>
        ))}
      </div>

      {/* Collapsible filter bar on mobile */}
      {isMobile ? (
        <>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="flex items-center gap-2 w-full theme-card p-3 mb-4 text-xs font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            <span>Filters</span>
            {Object.keys(filters).filter(k => filters[k] !== undefined).length > 0 && (
              <span className="theme-badge" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-text)' }}>
                {Object.keys(filters).filter(k => filters[k] !== undefined).length}
              </span>
            )}
            <svg className={`w-4 h-4 ml-auto shrink-0 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {filtersOpen && (
            <FilterBar filters={filters} setFilters={(f) => { setFilters(f) }} categories={categories} tiers={tiers} tags={tags} accounts={accounts} projects={projects} onClear={() => { setFilters({}); setFiltersOpen(false) }} />
          )}
        </>
      ) : (
        <FilterBar filters={filters} setFilters={(f) => { setFilters(f) }} categories={categories} tiers={tiers} tags={tags} accounts={accounts} projects={projects} onClear={() => { setFilters({}) }} />
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
          {['duplicates', 'uncategorized'].includes(quickFilter)
            ? `${displayTransactions.length} transactions (filtered from ${total})`
            : `${total} transactions`}
          {isFetching && !isLoading && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-accent)' }} />
              <span>updating...</span>
            </span>
          )}
        </span>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {quickFilter === 'uncategorized' && uncategorizedCount > 0 && (
            <button onClick={() => categorizeMutation.mutate({ all: true })} disabled={categorizeMutation.isPending}
              className="theme-btn-primary px-3 py-1 text-xs">
              {categorizeMutation.isPending ? 'Categorizing...' : `Auto-categorize all (${uncategorizedCount})`}
            </button>
          )}
          {['date', 'description', 'amount_cents'].map(col => (
            <button key={col} onClick={() => handleSort(col)} className="hover:underline" style={{ color: sortBy === col ? 'var(--color-accent-text)' : undefined }}>
              {col === 'amount_cents' ? 'Amount' : col.charAt(0).toUpperCase() + col.slice(1)} {sortBy === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="theme-card overflow-hidden">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center px-4 py-3 gap-3 animate-pulse" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: 'var(--color-surface-alt)' }} />
              <div className="w-5 h-5 rounded-md" style={{ backgroundColor: 'var(--color-surface-alt)' }} />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded w-48" style={{ backgroundColor: 'var(--color-surface-alt)' }} />
                <div className="h-2 rounded w-32" style={{ backgroundColor: 'var(--color-surface-alt)' }} />
              </div>
              <div className="h-3 rounded w-20" style={{ backgroundColor: 'var(--color-surface-alt)' }} />
            </div>
          ))}
        </div>
      ) : displayTransactions.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {Object.keys(filters).length > 0 || quickFilter !== 'all'
            ? 'No transactions match the current filters.'
            : 'No transactions found. Import some statements first.'}
        </p>
      ) : (
        <>
          {/* Summary bar */}
          {(totalSpend !== 0 || totalIncome !== 0) && (
            <div className="flex items-center gap-3 md:gap-5 mb-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{total} transactions</span>
              <span className="amount-expense font-medium">{formatAmount(totalSpend)} spent</span>
              {totalIncome > 0 && <span className="amount-income font-medium">{formatAmount(totalIncome)} income</span>}
              <span className="font-semibold" style={{ color: totalSpend + totalIncome >= 0 ? 'var(--color-income)' : 'var(--color-expense)' }}>
                Net: {formatAmount(totalSpend + totalIncome)}
              </span>
            </div>
          )}

          <div className="theme-card overflow-hidden">
            {/* Select all bar — desktop only */}
            {!isMobile && (
            <div className="flex items-center px-4 py-1.5 text-xs cursor-pointer select-none" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }} onClick={selectAll}>
              <input type="checkbox" checked={selected.size === transactions.length && transactions.length > 0} readOnly className="rounded w-4 h-4 mr-3 pointer-events-none" />
              <span>{selected.size > 0 ? `${selected.size} selected` : 'Select all'}</span>
            </div>
            )}

            {displayTransactions.map((txn, idx) => {
              const txnMonth = txn.date?.slice(0, 7)
              const prevMonth = idx > 0 ? displayTransactions[idx - 1].date?.slice(0, 7) : null
              const showMonthHeader = sortBy === 'date' && txnMonth && txnMonth !== prevMonth
              const monthData = monthlySubtotals[txnMonth]
              const monthLabel = txnMonth ? new Date(txnMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''

              return (
                <div key={txn.id}>
                  {showMonthHeader && (
                    <div className="flex items-center justify-between px-3 md:px-4 py-2 text-xs font-medium sticky top-0 z-[5]"
                      style={{ backgroundColor: 'var(--color-nav-bg)', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-light)', borderTop: idx > 0 ? '1px solid var(--color-border)' : undefined }}>
                      <span className="font-semibold">{monthLabel}</span>
                      {monthData && (
                        <div className="flex items-center gap-3">
                          <span style={{ color: 'var(--color-text-muted)' }}>{monthData.count} txns</span>
                          <span className="amount-expense">{formatAmount(monthData.spend)}</span>
                          {monthData.income > 0 && <span className="amount-income">{formatAmount(monthData.income)}</span>}
                        </div>
                      )}
                    </div>
                  )}
                  <TransactionRow
                    txn={txn}
                    categories={categories}
                    tiers={tiers}
                    projects={projects}
                    tags={tags}
                    selected={selected.has(txn.id)}
                    onToggleSelect={toggleSelect}
                    onUpdate={(id, data) => updateTxn.mutate({ id, data })}
                    onReviewTransfer={(ids, confirm) => {
                      if (confirm) {
                        bulkUpdateMutation.mutate({ transaction_ids: ids, needs_review: false })
                      } else {
                        bulkUpdateMutation.mutate({ transaction_ids: ids, is_transfer: false, needs_review: false })
                      }
                    }}
                    expanded={expandedId === txn.id}
                    onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                    onFilterByTag={(tagId) => setFilters(prev => ({ ...prev, tag_id: String(tagId) }))}
                    isMobile={isMobile}
                  />
                </div>
              )
            })}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="py-4 text-center">
            {isFetchingNextPage && (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading more...</span>
            )}
            {!hasNextPage && transactions.length > 0 && (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Showing all {transactions.length} of {total} transactions
              </span>
            )}
          </div>
        </>
      )}

      {/* Floating bulk actions bar — desktop only */}
      {!isMobile && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
          <span className="text-xs font-semibold shrink-0 mr-1" style={{ color: 'var(--color-text)' }}>
            {selected.size} selected
          </span>
          <div style={{ borderLeft: '1px solid var(--color-border-light)', height: 20 }} />
          <TypeaheadSelect className="w-36"
            value="" placeholder="Set category..."
            options={categories.map(c => ({ value: c.id, label: c.name }))}
            onChange={v => { if (v) { bulkUpdateMutation.mutate({ transaction_ids: [...selected], category_id: parseInt(v) }); setSelected(new Set()) } }} />
          <TypeaheadSelect className="w-32"
            value="" placeholder="Set tier..."
            options={tiers.map(t => ({ value: t.id, label: t.name, color: t.color }))}
            onChange={v => { if (v) { bulkUpdateMutation.mutate({ transaction_ids: [...selected], tier_id: parseInt(v) }); setSelected(new Set()) } }} />
          <TypeaheadSelect className="w-32"
            value="" placeholder="Add tag..."
            options={tags.map(t => ({ value: t.id, label: t.name, color: t.color }))}
            onChange={v => { if (v) { assignTagMutation.mutate({ tagId: parseInt(v), txnIds: [...selected] }); setSelected(new Set()) } }} />
          <TypeaheadSelect className="w-36"
            value="" placeholder="Add to project..."
            options={projects.map(p => ({ value: p.id, label: p.name }))}
            onChange={v => { if (v) { assignProjectMutation.mutate({ projectId: parseInt(v), txnIds: [...selected] }); setSelected(new Set()) } }} />
          <div style={{ borderLeft: '1px solid var(--color-border-light)', height: 20 }} />
          <button onClick={() => bulkUpdateMutation.mutate({ transaction_ids: [...selected], is_transfer: true, needs_review: false })} className="theme-btn-secondary px-3 py-1.5 text-xs whitespace-nowrap">
            Transfer
          </button>
          <button onClick={() => categorizeMutation.mutate({ transaction_ids: [...selected] })} className="theme-btn-secondary px-3 py-1.5 text-xs whitespace-nowrap">
            Auto-categorize
          </button>
          <button onClick={async () => {
            const count = selected.size
            if (confirm(`Hide ${count} selected transaction(s)? They won't appear in reports but can be restored from Settings.`)) {
              await api.post('/transactions/hide', { transaction_ids: [...selected], hidden: true })
              queryClient.invalidateQueries({ queryKey: ['transactions'] })
              setSelected(new Set())
              showToast(`Hid ${count} transaction${count !== 1 ? 's' : ''}`)
            }
          }} className="px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-danger)' }}>
            Hide
          </button>
          <button onClick={() => setSelected(new Set())} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--color-text-muted)' }} title="Deselect all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium"
          style={{ backgroundColor: 'var(--color-accent)', color: 'white', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
