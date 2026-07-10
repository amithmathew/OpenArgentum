import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'
import AureliaIcon from './AureliaIcon'

const CHART_COLORS = ['#5b8def', '#e06060', '#4caf7c', '#e8a040', '#8b7ec8', '#e88090']

function ChartContent({ chart, data, height, large }) {
  const fontSize = large ? 13 : 11
  const pieOuter = large ? 130 : 70
  const pieInner = large ? 65 : 35
  const yWidth = large ? 150 : 90

  if (chart.chart_type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={pieOuter} innerRadius={pieInner}
            label={large
              ? ({ label, percent }) => `${label} ${(percent * 100).toFixed(1)}%`
              : ({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`
            }>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Pie>
          <Tooltip formatter={v => `$${(v).toLocaleString()}`} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (chart.chart_type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
          <XAxis dataKey="label" tick={{ fontSize }} />
          <YAxis tick={{ fontSize }} tickFormatter={v => `$${v.toLocaleString()}`} />
          <Tooltip formatter={v => `$${v.toLocaleString()}`} />
          <Line type="monotone" dataKey="value" stroke="#5b8def" strokeWidth={2} dot={large} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // Default: bar chart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
        <XAxis type="number" tick={{ fontSize }} tickFormatter={v => `$${v.toLocaleString()}`} />
        <YAxis type="category" dataKey="label" tick={{ fontSize }} width={yWidth} />
        <Tooltip formatter={v => `$${v.toLocaleString()}`} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChartModal({ chart, onClose }) {
  const data = chart.data.map((d, i) => ({
    ...d,
    fill: d.color || CHART_COLORS[i % CHART_COLORS.length],
  }))

  const total = data.reduce((sum, d) => sum + Math.abs(d.value), 0)
  const chartHeight = chart.chart_type === 'pie'
    ? 340
    : Math.min(420, Math.max(280, data.length * 38))

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-3xl md:mx-4 rounded-t-2xl md:rounded-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', maxHeight: 'calc(100dvh - 70px)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{chart.title}</div>
          <button onClick={onClose} className="p-2 -mr-1" style={{ color: 'var(--color-text-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Chart — scrollable on mobile if tall */}
        <div className="px-4 py-4 shrink-0 overflow-x-auto">
          <ChartContent chart={chart} data={data} height={Math.min(chartHeight, 280)} large />
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto" style={{ borderTop: '1px solid var(--color-border-light)' }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                  {chart.chart_type === 'line' ? 'Period' : 'Category'}
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Amount</th>
                {chart.chart_type === 'pie' && (
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Share</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--color-text)' }}>
                    <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ backgroundColor: d.fill }} />
                    {d.label}
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--color-text)' }}>
                    ${Math.abs(d.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {chart.chart_type === 'pie' && (
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--color-text-muted)' }}>
                      {total > 0 ? ((Math.abs(d.value) / total) * 100).toFixed(1) : 0}%
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {data.length > 1 && (
              <tfoot style={{ backgroundColor: 'var(--color-surface-alt)' }}>
                <tr>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--color-text)' }}>Total</td>
                  <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: 'var(--color-text)' }}>
                    ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {chart.chart_type === 'pie' && (
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--color-text-muted)' }}>100%</td>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

function InlineChart({ chart }) {
  const [expanded, setExpanded] = useState(false)

  if (!chart?.data?.length) return null

  const data = chart.data.map((d, i) => ({
    ...d,
    fill: d.color || CHART_COLORS[i % CHART_COLORS.length],
  }))

  const height = Math.min(280, Math.max(160, data.length * 34))

  return (
    <div className="my-2">
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>{chart.title}</div>
      <ChartContent chart={chart} data={data} height={height} />
      <button onClick={() => setExpanded(true)} className="flex items-center gap-1 mt-1.5 px-2 py-1 rounded-md text-[11px] font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-accent-text)', backgroundColor: 'var(--color-accent-light)' }}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25-5.25v4.5m0-4.5h-4.5m4.5 0L15 9m-11.25 11.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
        </svg>
        Expand
      </button>
      {expanded && createPortal(<ChartModal chart={chart} onClose={() => setExpanded(false)} />, document.body)}
    </div>
  )
}

const OVERRIDE_FIELD_LABELS = {
  date: 'Date', description: 'Description', amount_cents: 'Amount',
  category_id: 'Category', tier_id: 'Tier', is_transfer: 'Transfer', needs_review: 'Needs review',
}

function MutationProposal({ proposal, onAction }) {
  const [status, setStatus] = useState(proposal.status || 'pending')
  const [showAll, setShowAll] = useState(false)
  const [fullList, setFullList] = useState(null)
  const [loadingFull, setLoadingFull] = useState(false)

  const handleApprove = async () => {
    setStatus('executing')
    try {
      await api.post(`/mutations/${proposal.mutation_id}/execute`)
      setStatus('executed')
      if (onAction) onAction(proposal.mutation_id, 'executed')
    } catch {
      setStatus('failed')
    }
  }

  const handleReject = async () => {
    await api.post(`/mutations/${proposal.mutation_id}/reject`)
    setStatus('rejected')
    if (onAction) onAction(proposal.mutation_id, 'rejected')
  }

  const handleShowAll = async () => {
    if (!fullList) {
      setLoadingFull(true)
      try {
        const result = await api.get(`/mutations/${proposal.mutation_id}/details`)
        setFullList(result.items || [])
      } catch {}
      setLoadingFull(false)
    }
    setShowAll(true)
  }

  const displayLimit = 3
  const hasMore = proposal.impacted_count > displayLimit

  return (
    <>
    {/* Detail modal — portaled to body to escape chat panel stacking context */}
    {showAll && createPortal(
      <MutationDetailModal
        title={proposal.title}
        items={fullList || proposal.sample_items || []}
        totalCount={proposal.impacted_count}
        status={status}
        onApprove={handleApprove}
        onReject={handleReject}
        onClose={() => setShowAll(false)}
      />,
      document.body
    )}

    <div className="mt-2 rounded-lg p-2.5 text-xs" style={{ backgroundColor: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
      <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>{proposal.title}</div>
      {proposal.impacted_count > 0 && (
        <div className="mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {proposal.intent === 'override'
            ? `${proposal.impacted_count} change${proposal.impacted_count !== 1 ? 's' : ''}`
            : `${proposal.impacted_count} transaction${proposal.impacted_count !== 1 ? 's' : ''} affected`}
        </div>
      )}
      {(proposal.sample_items || []).length > 0 && (
        <div className="mb-2">
          <div className="space-y-1">
            {(proposal.intent === 'override' ? proposal.sample_items : proposal.sample_items.slice(0, 3)).map((item, i) => (
              <div key={item.id ? `${item.id}-${i}` : i} style={{ color: 'var(--color-text-secondary)' }}>
                <div className="flex justify-between">
                  <span className="truncate flex-1">{item.date} — {item.label}</span>
                  {item.field == null && <span className="ml-2 font-mono shrink-0">${Math.abs(item.amount).toFixed(2)}</span>}
                </div>
                {item.field != null && (
                  <div className="pl-2 truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {OVERRIDE_FIELD_LABELS[item.field] || item.field}:{' '}
                    <span style={{ textDecoration: 'line-through' }}>{item.from ?? '—'}</span>
                    {' → '}
                    <span style={{ color: 'var(--color-text)' }}>{item.to ?? '—'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {proposal.intent !== 'override' && hasMore && (
            <button onClick={handleShowAll} className="mt-1 font-medium" style={{ color: 'var(--color-accent-text)' }}>
              {loadingFull ? 'Loading...' : `View all ${proposal.impacted_count} transactions →`}
            </button>
          )}
        </div>
      )}
      {status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={handleApprove} className="theme-btn-primary px-3 py-1 text-xs">Approve</button>
          <button onClick={handleReject} className="theme-btn-secondary px-3 py-1 text-xs">Reject</button>
        </div>
      )}
      {status === 'executing' && <span style={{ color: 'var(--color-accent-text)' }}>Executing...</span>}
      {status === 'executed' && <span style={{ color: 'var(--color-success)' }}>Approved and executed</span>}
      {status === 'rejected' && <span style={{ color: 'var(--color-text-muted)' }}>Rejected</span>}
      {status === 'failed' && <span style={{ color: 'var(--color-danger)' }}>Failed to execute</span>}
    </div>
    </>
  )
}

function MutationDetailModal({ title, items, totalCount, status, onApprove, onReject, onClose }) {
  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [search, setSearch] = useState('')

  const filtered = items.filter(item => {
    if (!search) return true
    return item.label?.toLowerCase().includes(search.toLowerCase()) || item.date?.includes(search)
  })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'date') cmp = (a.date || '').localeCompare(b.date || '')
    else if (sortBy === 'label') cmp = (a.label || '').localeCompare(b.label || '')
    else if (sortBy === 'amount') cmp = Math.abs(a.amount) - Math.abs(b.amount)
    return sortDir === 'desc' ? -cmp : cmp
  })

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const renderSortCol = (col, label, align) => (
    <th key={col} className={`px-3 py-2 text-xs font-medium uppercase tracking-wider cursor-pointer select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ color: sortBy === col ? 'var(--color-accent-text)' : 'var(--color-text-muted)' }}
      onClick={() => handleSort(col)}>
      {label} {sortBy === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl md:max-h-[80vh] md:mx-4 rounded-t-2xl md:rounded-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', maxHeight: 'calc(100dvh - 70px)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{title}</div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{totalCount} transactions</div>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--color-text-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
          <input className="theme-input w-full px-3 py-1.5 text-xs" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions..." />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
              <tr>
                {renderSortCol('date', 'Date')}
                {renderSortCol('label', 'Description')}
                {renderSortCol('amount', 'Amount', 'right')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => (
                <tr key={item.id || i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>{item.date}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--color-text)' }}>{item.label}</td>
                  <td className={`px-3 py-2 text-right font-mono ${item.amount < 0 ? 'amount-expense' : 'amount-income'}`}>
                    ${Math.abs(item.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>No matching transactions</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 text-xs shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--color-border-light)', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <span style={{ color: 'var(--color-text-muted)' }}>Showing {sorted.length} of {totalCount}</span>
          <div className="flex items-center gap-2">
            {status === 'pending' && (
              <>
                <button onClick={() => { onApprove(); onClose() }} className="theme-btn-primary px-4 py-2 text-xs">Approve</button>
                <button onClick={() => { onReject(); onClose() }} className="theme-btn-secondary px-3 py-2 text-xs">Reject</button>
              </>
            )}
            {status === 'executed' && <span style={{ color: 'var(--color-success)' }}>Approved and executed</span>}
            {status === 'rejected' && <span style={{ color: 'var(--color-text-muted)' }}>Rejected</span>}
            <button onClick={onClose} className="theme-btn-secondary px-3 py-2 text-xs">Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const TOOL_LABELS = {
  query_transactions: 'Queried transactions',
  aggregate_spending: 'Aggregated spending',
  compare_periods: 'Compared periods',
  get_summary: 'Got financial summary',
  generate_chart: 'Generated chart',
  navigate_to_transactions: 'Opened transactions view',
  propose_bulk_tag: 'Proposed tagging',
  propose_bulk_untag: 'Proposed tag removal',
  propose_override: 'Proposed a correction',
  propose_hide: 'Proposed hiding transactions',
  propose_bulk_recategorize: 'Proposed recategorization',
  propose_mark_transfer: 'Proposed transfer marking',
  propose_assign_project: 'Proposed project assignment',
  propose_create_category: 'Proposed new category',
  propose_create_tag: 'Proposed new tag',
  propose_create_project: 'Proposed new project',
}

function formatToolArgs(args) {
  if (!args || typeof args !== 'object') return ''
  const entries = Object.entries(args).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
  if (entries.length === 0) return ''
  return entries.map(([k, v]) => {
    const label = k.replace(/_/g, ' ')
    const val = Array.isArray(v) ? v.join(', ') : String(v)
    return `${label}: ${val}`
  }).join(' · ')
}

function ToolCallDetails({ tools }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mt-1">
      <button onClick={() => setExpanded(!expanded)} className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Used {tools.length} tool{tools.length > 1 ? 's' : ''}
      </button>
      {expanded && (
        <div className="mt-1 pl-4 space-y-1">
          {tools.map((tool, i) => {
            // Support both old format (string) and new format ({name, args})
            const name = typeof tool === 'string' ? tool : tool.name
            const args = typeof tool === 'object' ? tool.args : null
            const argsStr = formatToolArgs(args)
            return (
              <div key={i} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <span className="font-medium">{TOOL_LABELS[name] || name}</span>
                {argsStr && <div className="pl-2 mt-0.5" style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}>{argsStr}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ExecutedMutation({ mutation: m, onUndo }) {
  const [showDetails, setShowDetails] = useState(false)
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleViewDetails = async () => {
    if (!items) {
      setLoading(true)
      try {
        const result = await api.get(`/mutations/${m.mutation_id}/details`)
        setItems(result.items || [])
      } catch {
        setItems([])
      }
      setLoading(false)
    }
    setShowDetails(!showDetails)
  }

  return (
    <div className="mt-2 text-xs rounded" style={{ backgroundColor: 'var(--color-accent-light)' }}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span style={{ color: 'var(--color-success)' }}>Done: {m.title}</span>
        <button onClick={handleViewDetails} className="font-medium" style={{ color: 'var(--color-accent-text)' }}>
          {loading ? '...' : showDetails ? 'Hide' : 'Details'}
        </button>
        {!m.reverted && (
          <button onClick={() => onUndo?.(m.mutation_id)} className="font-medium" style={{ color: 'var(--color-text-muted)' }}>Undo</button>
        )}
        {m.reverted && <span style={{ color: 'var(--color-text-muted)' }}>Reverted</span>}
      </div>
      {showDetails && items && (
        <div className="px-2 pb-2 max-h-48 overflow-y-auto" style={{ borderTop: '1px solid var(--color-border-light)' }}>
          {items.length === 0 ? (
            <div className="py-1" style={{ color: 'var(--color-text-muted)' }}>No details available</div>
          ) : (
            <div className="space-y-0.5 pt-1">
              {items.map((item, i) => (
                <div key={item.id || i} className="flex justify-between" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="truncate flex-1">{item.date} — {item.label}</span>
                  <span className="ml-2 font-mono shrink-0">${Math.abs(item.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChatMessage({ msg, onNavigate }) {
  const isUser = msg.role === 'user'
  const metadata = msg.metadata || {}
  const isAction = metadata.is_action

  // Action messages (approve/reject/undo) — centered, muted
  if (isAction) {
    return (
      <div className="flex justify-center mb-2">
        <div className="text-xs px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-secondary)' }}>
          {String(msg.content || '')}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className="max-w-[85%] min-w-0 break-words rounded-xl px-3 py-2 text-sm"
        style={{
          backgroundColor: isUser ? 'var(--color-accent)' : 'var(--color-surface)',
          color: isUser ? 'white' : 'var(--color-text)',
          border: isUser ? 'none' : '1px solid var(--color-border-light)',
        }}>
        {/* Message text */}
        {isUser ? (
          <div className="whitespace-pre-wrap leading-relaxed">{String(msg.content || '')}</div>
        ) : (
          <div className="leading-relaxed prose-sm [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_th]:text-left [&_th]:px-2 [&_th]:py-1.5 [&_td]:px-2 [&_td]:py-1.5 [&_thead]:border-b [&_tr]:border-b [&_code]:text-xs [&_code]:px-1 [&_code]:rounded [&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre]:p-2 [&_pre]:rounded-lg"
            style={{ ['--tw-border-opacity']: 1 }}>
            <Markdown remarkPlugins={[remarkGfm]} components={{
              table: ({ children }) => (
                <div className="overflow-x-auto -mx-3 px-3 my-2">
                  <table className="text-xs whitespace-nowrap">{children}</table>
                </div>
              ),
            }}>{String(msg.content || '')}</Markdown>
          </div>
        )}

        {/* Inline charts */}
        {metadata.charts?.map((chart, i) => (
          <InlineChart key={i} chart={chart} />
        ))}

        {/* Navigation link */}
        {metadata.navigation && (
          <button
            onClick={() => onNavigate(metadata.navigation.path, metadata.navigation.params)}
            className="mt-2 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded"
            style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-text)' }}
          >
            View in Transactions →
          </button>
        )}

        {/* Mutation proposals — approve/reject buttons */}
        {metadata.proposals?.map((p, i) => (
          <MutationProposal key={p.mutation_id || i} proposal={p} onAction={msg.onProposalAction} />
        ))}

        {/* Executed mutations — undo button + view details */}
        {metadata.executed_mutations?.map((m, i) => (
          <ExecutedMutation key={i} mutation={m} onUndo={msg.onUndo} />
        ))}

        {/* Tool calls indicator — clickable to expand */}
        {metadata.tool_calls?.length > 0 && !isUser && !metadata.proposals?.length && (
          <ToolCallDetails tools={metadata.tool_calls} />
        )}

        {/* Retry button on error messages */}
        {metadata.isError && metadata.retryMessage && (
          <button
            onClick={() => { if (msg.onRetry) msg.onRetry(metadata.retryMessage) }}
            className="mt-2 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors"
            style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-accent-text)' }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

function EditableTitle({ title, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const inputRef = useRef(null)

  useEffect(() => { setValue(title) }, [title])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const handleSave = () => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== title) onSave(trimmed)
    else setValue(title)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="theme-input text-sm font-semibold px-1 py-0 min-w-0 flex-1"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setValue(title); setEditing(false) } }}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm font-semibold leading-tight text-left truncate min-w-0 flex-1 hover:opacity-70"
      style={{ color: 'var(--color-text)' }}
      title="Click to rename"
    >
      {title}
    </button>
  )
}

export default function ChatPanel({ open, fullscreen, onClose, onToggleFullscreen, onNavigate, isMobile, initialPrompt, onPromptConsumed }) {
  const queryClient = useQueryClient()
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [liveCharts, setLiveCharts] = useState([])
  const [showSessions, setShowSessions] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)
  const wantsNewSession = useRef(false)
  const isSending = useRef(false)
  const activeStreamRef = useRef(null)  // Abort function for the current SSE stream

  const scrollToBottom = useCallback(() => {
    // Use scrollTop instead of scrollIntoView to avoid iOS Safari full-page scroll bug
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [])

  // Abort active stream when panel closes or component unmounts
  useEffect(() => {
    if (!open) abortActiveStream()
    return () => abortActiveStream()
  }, [open])

  // Load sessions
  useEffect(() => {
    if (open) {
      api.get('/chat/sessions').then(setSessions).catch(() => {})
    }
  }, [open])

  // Select most recent session if none active (but not if user explicitly started a new chat)
  useEffect(() => {
    if (open && sessions.length > 0 && !activeSessionId && !wantsNewSession.current) {
      setActiveSessionId(sessions[0].id)
    }
  }, [open, sessions, activeSessionId])

  // Load messages when session changes (skip if we're mid-send to avoid wiping optimistic messages)
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  useEffect(() => {
    if (activeSessionId && !isSending.current) {
      const targetSessionId = activeSessionId // Capture to detect stale responses
      api.get(`/chat/sessions/${activeSessionId}/messages`).then(msgs => {
        // Ignore if user switched sessions while this fetch was in flight
        if (targetSessionId !== activeSessionIdRef.current) return
        // Attach handlers for proposals and undo on loaded messages
        for (const msg of msgs) {
          if (msg.metadata?.proposals?.length) {
            msg.onProposalAction = handleProposalAction
          }
          if (msg.metadata?.executed_mutations?.length) {
            msg.onUndo = handleUndo
          }
        }
        setMessages(msgs)
        setTimeout(scrollToBottom, 100)
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId])

  // Scroll to bottom when the panel opens (only on the closed→open transition)
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open && !wasOpenRef.current && messages.length > 0) {
      setTimeout(scrollToBottom, 100)
    }
    wasOpenRef.current = open
  }, [open, messages.length, scrollToBottom])

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open, activeSessionId])

  const handleRetry = (retryMessage) => {
    // Remove the error message and the user message before it, then resend
    setMessages(prev => {
      const cleaned = [...prev]
      // Remove last two messages (user msg + error response)
      if (cleaned.length >= 2) cleaned.splice(-2, 2)
      else if (cleaned.length >= 1) cleaned.splice(-1, 1)
      return cleaned
    })
    setInput(retryMessage)
    setTimeout(() => handleSend(retryMessage), 100)
  }

  const handleSend = async (overrideMessage) => {
    const msgToSend = overrideMessage || input.trim()
    if (!msgToSend || isLoading || isSending.current) return

    // Blur input on mobile to dismiss keyboard before async work, preventing Safari layout bugs
    if (isMobile) inputRef.current?.blur()

    isSending.current = true

    // Create session on first message if needed
    let sessionId = activeSessionId
    if (!sessionId) {
      try {
        const session = await api.post('/chat/sessions')
        setSessions(prev => [session, ...prev])
        setActiveSessionId(session.id)
        wantsNewSession.current = false
        sessionId = session.id
      } catch {
        return
      }
    }

    const userMsg = msgToSend
    setInput('')
    setIsLoading(true)
    setStatusText('Thinking...')
    setLiveCharts([])

    // Optimistic user message
    const tempUserMsg = { id: Date.now(), role: 'user', content: userMsg, metadata: {} }
    setMessages(prev => [...prev, tempUserMsg])
    setTimeout(scrollToBottom, 50)

    // Create atomic stream state — token + abort bundled together, set BEFORE stream starts
    const stream = { token: Symbol(), abort: null, sessionId: sessionId }
    activeStreamRef.current = stream
    const isMyStream = () => activeStreamRef.current === stream

    try {
      const pendingProposals = []

      const { promise, abort } = api.stream(`/chat/sessions/${sessionId}/messages`, { message: userMsg }, (event) => {
        if (!isMyStream()) return  // Stale stream — drop event
        switch (event.type) {
          case 'status':
            setStatusText(event.content)
            break
          case 'chart':
            setLiveCharts(prev => [...prev, event.chart])
            break
          case 'navigation':
            break
          case 'pending_approval':
            pendingProposals.push(event)
            setStatusText(`Awaiting approval: ${event.title}`)
            break
          case 'response': {
            const msg = event.message
            if (pendingProposals.length > 0) {
              if (!msg.metadata) msg.metadata = {}
              msg.metadata.proposals = [...pendingProposals]
            }
            msg.onUndo = handleUndo
            msg.onProposalAction = handleProposalAction
            setMessages(prev => [...prev, msg])
            setStatusText('')
            setLiveCharts([])
            setTimeout(scrollToBottom, 50)
            if (event.session_title) {
              setSessions(prev => prev.map(s => s.id === msg.session_id ? { ...s, title: event.session_title } : s))
            }
            api.get('/chat/sessions').then(setSessions).catch(() => {})
            break
          }
          case 'error':
            setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: `Error: ${event.error}`, metadata: { isError: true }, onRetry: handleRetry }])
            setStatusText('')
            setLiveCharts([])
            break
        }
      })
      stream.abort = abort
      await promise
    } catch (err) {
      if (isMyStream()) {
        setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: `Error: ${err.message}`, metadata: { isError: true }, onRetry: handleRetry }])
      }
    } finally {
      // CRITICAL: Only unlock UI if THIS stream is still the active one.
      // A stale stream's finally must NOT flip isLoading/isSending — that's what caused duplicate sessions.
      if (isMyStream()) {
        activeStreamRef.current = null
        isSending.current = false
        setIsLoading(false)
        setStatusText('')
      }
    }
  }

  const invalidateDataCaches = () => {
    // Refresh all data views that mutations might have changed
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['categories'] })
    queryClient.invalidateQueries({ queryKey: ['tags'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-categories'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-tiers'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-tags'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-trends'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-accounts'] })
    queryClient.invalidateQueries({ queryKey: ['transaction-counts'] })
    queryClient.invalidateQueries({ queryKey: ['settings-stats'] })
  }

  const handleUndo = async (mutationId) => {
    try {
      await api.post(`/mutations/${mutationId}/undo`)
      setMessages(prev => prev.map(m => {
        if (m.metadata?.executed_mutations) {
          return {
            ...m,
            metadata: {
              ...m.metadata,
              executed_mutations: m.metadata.executed_mutations.map(em =>
                em.mutation_id === mutationId ? { ...em, reverted: true } : em
              ),
            },
          }
        }
        return m
      }))
      invalidateDataCaches()
    } catch (e) {
      alert(`Undo failed: ${e.message}`)
    }
  }

  const handleProposalAction = (mutationId, action) => {
    let proposalTitle = ''
    for (const m of messages) {
      const found = m.metadata?.proposals?.find(p => p.mutation_id === mutationId)
      if (found) { proposalTitle = found.title; break }
    }

    if (action === 'executed') {
      // Move proposal to executed_mutations for undo support
      setMessages(prev => prev.map(m => {
        const proposals = m.metadata?.proposals
        if (proposals) {
          const executed = proposals.find(p => p.mutation_id === mutationId)
          if (executed) {
            return {
              ...m,
              onUndo: handleUndo,
              metadata: {
                ...m.metadata,
                proposals: proposals.filter(p => p.mutation_id !== mutationId),
                executed_mutations: [...(m.metadata.executed_mutations || []), { mutation_id: mutationId, title: executed.title }],
              },
            }
          }
        }
        return m
      }))

      // Show action message locally (backend saves to DB via _save_action_to_chat)
      setMessages(prev => [...prev, {
        id: Date.now(), role: 'user',
        content: `✓ Approved: ${proposalTitle} — Applied successfully`,
        metadata: { is_action: true },
      }])
      setTimeout(scrollToBottom, 50)
      invalidateDataCaches()

    } else if (action === 'rejected') {
      setMessages(prev => [...prev, {
        id: Date.now(), role: 'user',
        content: `✓ Rejected: ${proposalTitle} — Proposal dismissed`,
        metadata: { is_action: true },
      }])
      setTimeout(scrollToBottom, 50)
    }
  }

  const abortActiveStream = () => {
    const stream = activeStreamRef.current
    if (stream?.abort) stream.abort()
    activeStreamRef.current = null
    isSending.current = false
    setIsLoading(false)
    setStatusText('')
    setLiveCharts([])
  }

  const handleNewSession = () => {
    if (isLoading) return  // Block while stream is active
    wantsNewSession.current = true
    setActiveSessionId(null)
    setMessages([])
    setShowSessions(false)
  }

  // Auto-send a seeded prompt (e.g. from the dashboard "review transfers" banner) in a fresh session.
  const handleSendRef = useRef(null)
  useEffect(() => { handleSendRef.current = handleSend })
  const seedHandledRef = useRef(false)
  useEffect(() => {
    if (!initialPrompt) { seedHandledRef.current = false; return }  // reset when parent clears it
    if (!open || seedHandledRef.current) return
    seedHandledRef.current = true
    const prompt = initialPrompt
    wantsNewSession.current = true
    setActiveSessionId(null)
    setMessages([])
    onPromptConsumed?.()
    // Fire after the reset render so handleSend sees a null session → creates a fresh one.
    // No cleanup: consuming the prompt re-runs this effect, and we must not cancel the pending send.
    setTimeout(() => handleSendRef.current?.(prompt), 60)
  }, [open, initialPrompt, onPromptConsumed])

  const handleDeleteSession = async (id) => {
    if (isLoading && activeSessionId === id) return  // Can't delete active session while streaming
    await api.delete(`/chat/sessions/${id}`)
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSessionId === id) {
      setActiveSessionId(null)
      setMessages([])
    }
  }

  const handleNavigate = (path, params) => {
    if (onNavigate) {
      const query = new URLSearchParams(params).toString()
      onNavigate(`${path}?${query}`)
    }
  }

  // Resizable width
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('chat-panel-width')
    return saved ? parseInt(saved) : 400
  })
  const isResizing = useRef(false)
  const latestWidth = useRef(panelWidth)
  useEffect(() => { latestWidth.current = panelWidth }, [panelWidth])

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = latestWidth.current

    const onMouseMove = (e) => {
      if (!isResizing.current) return
      const newWidth = Math.max(320, Math.min(800, startWidth + (startX - e.clientX)))
      setPanelWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizing.current = false
      localStorage.setItem('chat-panel-width', String(latestWidth.current))
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  if (!open) return null

  return (
    <>
    {/* Mobile backdrop — only for side-panel mode, not fullscreen */}
    {!fullscreen && <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onClose} />}

    {/* Panel: fullscreen = flex-1 replacing main, side panel = fixed width, mobile = full overlay */}
    <div className={`${fullscreen ? 'flex-1 relative min-w-0' : 'fixed inset-0 z-50 md:relative md:inset-auto shrink-0'} h-full flex flex-col overflow-hidden`}
      style={{ width: fullscreen || isMobile ? undefined : panelWidth, backgroundColor: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)' }}>

      {/* Resize handle (desktop only) */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:w-1.5 transition-all hidden md:block"
        style={{ backgroundColor: 'transparent' }}
        onMouseDown={handleResizeStart}
        onMouseEnter={e => e.target.style.backgroundColor = 'var(--color-accent)'}
        onMouseLeave={e => { if (!isResizing.current) e.target.style.backgroundColor = 'transparent' }}
      />

      {/* Header */}
      <div className="shrink-0" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <AureliaIcon size={20} className="shrink-0" />
            {!showSessions && (
              <EditableTitle
                title={sessions.find(s => s.id === activeSessionId)?.title || 'New Chat'}
                onSave={async (newTitle) => {
                  if (!activeSessionId) return
                  await api.put(`/chat/sessions/${activeSessionId}`, { title: newTitle })
                  setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, title: newTitle } : s))
                }}
              />
            )}
            {showSessions && (
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Sessions</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleNewSession} disabled={isLoading} title="New chat" className="p-1.5 rounded-md transition-colors disabled:opacity-30"
              style={{ color: 'var(--color-accent-text)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <button onClick={() => setShowSessions(!showSessions)} disabled={isLoading} title={showSessions ? 'Back to chat' : 'All sessions'}
              className="p-1.5 rounded-md transition-colors disabled:opacity-30"
              style={{ color: showSessions ? 'var(--color-accent-text)' : 'var(--color-text-muted)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={showSessions ? 'M15 19l-7-7 7-7' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
            <button onClick={onToggleFullscreen} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="p-1.5 rounded-md transition-colors hidden md:block" style={{ color: fullscreen ? 'var(--color-accent-text)' : 'var(--color-text-muted)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={fullscreen
                  ? 'M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25'
                  : 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15'
                } />
              </svg>
            </button>
            <button onClick={onClose} title="Close" className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--color-text-muted)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Session list */}
      {showSessions ? (
        <div className="flex-1 overflow-y-auto p-3">
          {sessions.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-muted)' }}>No chat history yet</p>
          )}
          {sessions.map(s => (
            <div key={s.id}
              className="group flex items-start gap-3 px-3 py-2.5 rounded-lg mb-1 cursor-pointer transition-colors"
              style={{
                backgroundColor: s.id === activeSessionId ? 'var(--color-accent-light)' : 'transparent',
              }}
              onClick={() => {
                if (isLoading) return
                wantsNewSession.current = false; setActiveSessionId(s.id); setShowSessions(false)
              }}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug" style={{ color: s.id === activeSessionId ? 'var(--color-accent-text)' : 'var(--color-text)' }}>
                  {s.title}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {new Date(s.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <button onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('Delete this chat session?')) handleDeleteSession(s.id)
                }}
                className="p-1 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
                style={{ color: 'var(--color-danger)' }} title="Delete session">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 min-w-0 overflow-y-auto px-4 py-3">
            {messages.length === 0 && !isLoading && (
              <div className="text-center py-8">
                <div className="flex justify-center mb-2"><AureliaIcon size={48} /></div>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Hi, I'm Aurelia — your finance assistant</p>
                <div className="mt-4 space-y-2">
                  {['How much did I spend last month?', 'Show spending by category', 'Compare this month vs last'].map(q => (
                    <button key={q} onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 0) }}
                      className="block w-full text-left text-xs px-3 py-2 rounded-lg transition-colors"
                      style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-secondary)' }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <ChatMessage key={msg.id || i} msg={msg} onNavigate={handleNavigate} />
            ))}

            {/* Live status */}
            {isLoading && (
              <div className="flex justify-start mb-3">
                <div className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-secondary)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-accent)' }} />
                    <span>{statusText || 'Thinking...'}</span>
                  </div>
                  {/* Live charts during processing */}
                  {liveCharts.map((chart, i) => (
                    <InlineChart key={i} chart={chart} />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--color-border-light)', paddingBottom: isMobile ? 'calc(12px + 56px + env(safe-area-inset-bottom, 0px))' : undefined }}>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                className="theme-input flex-1 px-3 py-3 md:py-2 text-base md:text-sm"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Ask Aurelia about your finances..."
                disabled={isLoading}
              />
              <button onClick={() => handleSend()} disabled={isLoading || !input.trim()}
                className="theme-btn-primary px-3 py-2 text-sm disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  )
}
