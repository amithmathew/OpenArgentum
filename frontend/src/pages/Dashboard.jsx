import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { api } from '../api'
import { useTheme } from '../theme-context'
import { useChat } from '../chat-context'
import InstitutionIcon from '../components/InstitutionIcon'
import useIsMobile from '../hooks/useIsMobile'

function formatDollars(cents) {
  return '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Data-freshness cue for an account's most recent processed transaction.
function accountFreshness(lastDate) {
  if (!lastDate) return { rel: 'No transactions', dot: 'var(--color-text-muted)', stale: false }
  const days = Math.floor((Date.now() - new Date(lastDate + 'T00:00:00').getTime()) / 86400000)
  const rel = days <= 0 ? 'today'
    : days === 1 ? '1 day ago'
    : days < 30 ? `${days} days ago`
    : days < 365 ? `~${Math.max(1, Math.round(days / 30))} mo ago`
    : `~${Math.round(days / 365)} yr ago`
  const dot = days > 35 ? 'var(--color-expense)' : days > 14 ? 'var(--color-warning)' : 'var(--color-income)'
  return { rel, dot, stale: days > 35 }
}

function formatShortDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function SummaryCard({ label, value, colorVar }) {
  return (
    <div className="theme-card p-5">
      <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: colorVar ? `var(${colorVar})` : 'var(--color-text)' }}>{value}</div>
    </div>
  )
}

const PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: 'YTD', months: 0 },
  { label: '1Y', months: 12 },
  { label: 'All', months: 120 },
  { label: 'Custom', months: -1 },
]

function useChartColors() {
  useTheme() // re-render (and re-read CSS vars) when the theme changes
  const get = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
  return {
    expense: get('--color-expense'),
    income: get('--color-income'),
    chart: [get('--color-chart-1'), get('--color-chart-2'), get('--color-chart-3'), get('--color-chart-4'), get('--color-chart-5'), get('--color-chart-6')],
    text: get('--color-text-secondary'),
    grid: get('--color-border-light'),
    surface: get('--color-surface'),
    border: get('--color-border'),
  }
}

export default function Dashboard() {
  const [months, setMonths] = useState(12)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const c = useChartColors()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { askAurelia } = useChat()
  const chartHeight = isMobile ? 200 : 280
  const yAxisWidth = isMobile ? 70 : 110

  const { data: counts } = useQuery({ queryKey: ['transaction-counts'], queryFn: () => api.get('/transactions/counts') })
  const suspectedTransfers = counts?.suspected_transfers || 0

  const { data: accountsData } = useQuery({ queryKey: ['dashboard-accounts'], queryFn: () => api.get('/dashboard/accounts') })
  const accounts = accountsData?.items || []

  const goToTransactions = (filters) => {
    const params = new URLSearchParams({ ...dateRange, ...filters }).toString()
    navigate(`/transactions?${params}`)
  }

  const isCustom = months === -1

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories') })
  const { data: tiers = [] } = useQuery({ queryKey: ['tiers'], queryFn: () => api.get('/tiers') })

  const categoryByName = useMemo(() => Object.fromEntries(categories.map(c => [c.name, c])), [categories])
  const tierByName = useMemo(() => Object.fromEntries(tiers.map(t => [t.name, t])), [tiers])

  // Compute date range from months preset (plain compute; used as a value-serialized query key)
  const dateRange = (() => {
    if (isCustom) {
      return customFrom ? { date_from: customFrom, ...(customTo ? { date_to: customTo } : {}) } : {}
    }
    if (!months || months >= 120) return {} // "All" = no filter
    const now = new Date()
    const from = new Date(now)
    if (months === 0) {
      // YTD
      from.setMonth(0, 1)
    } else {
      from.setMonth(from.getMonth() - months)
    }
    return { date_from: from.toISOString().slice(0, 10), date_to: now.toISOString().slice(0, 10) }
  })()

  const { data: summary } = useQuery({
    queryKey: ['dashboard-summary', months],
    queryFn: () => api.get('/dashboard/monthly-summary', { months: isCustom ? 120 : (months || 120) }),
  })
  const { data: categoryData } = useQuery({
    queryKey: ['dashboard-categories', dateRange],
    queryFn: () => api.get('/dashboard/category-breakdown', dateRange),
  })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: () => api.get('/tags') })
  const tagById = useMemo(() => Object.fromEntries(tags.map(t => [t.name, t])), [tags])
  const { data: tagData } = useQuery({
    queryKey: ['dashboard-tags', dateRange],
    queryFn: () => api.get('/dashboard/tag-breakdown', dateRange),
  })
  const { data: tierData } = useQuery({
    queryKey: ['dashboard-tiers', dateRange],
    queryFn: () => api.get('/dashboard/tier-breakdown', dateRange),
  })
  const { data: trendsData } = useQuery({
    queryKey: ['dashboard-trends', months],
    queryFn: () => api.get('/dashboard/trends', { months: months || 120 }),
  })

  const monthlyData = useMemo(() => {
    if (!summary?.months) return []
    return [...summary.months].reverse().map(m => ({
      month: m.month,
      spend: Math.abs(m.total_spend) / 100,
      income: (m.total_income || 0) / 100,
    }))
  }, [summary])

  const tierPieData = useMemo(() => {
    if (!tierData?.items) return []
    return tierData.items.map(t => ({ name: t.tier, value: Math.abs(t.total) / 100, color: t.color }))
  }, [tierData])

  const topCategories = useMemo(() => {
    if (!categoryData?.items) return []
    return categoryData.items.slice(0, 10).map(c => ({ name: c.category, amount: Math.abs(c.total) / 100 }))
  }, [categoryData])

  const topTags = useMemo(() => {
    if (!tagData?.items) return []
    return tagData.items.slice(0, 10).map(t => ({ name: t.tag, amount: Math.abs(t.total) / 100, color: t.color }))
  }, [tagData])

  // Horizontal bar charts need enough height to show all labels — scale by item count
  const catChartHeight = Math.max(chartHeight, topCategories.length * 28)
  const tagChartHeight = Math.max(chartHeight, topTags.length * 28)

  const trendChartData = useMemo(() => {
    if (!trendsData?.items) return { data: [], tiers: [] }
    const byMonth = {}
    const tierSet = new Set()
    for (const item of trendsData.items) {
      if (!byMonth[item.month]) byMonth[item.month] = { month: item.month }
      byMonth[item.month][item.tier] = Math.abs(item.total) / 100
      tierSet.add(item.tier)
    }
    return { data: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)), tiers: [...tierSet] }
  }, [trendsData])

  const totalSpend = summary?.months?.reduce((s, m) => s + (m.total_spend || 0), 0) || 0
  const totalIncome = summary?.months?.reduce((s, m) => s + (m.total_income || 0), 0) || 0
  const totalNet = totalSpend + totalIncome
  const totalTxns = summary?.months?.reduce((s, m) => s + (m.transaction_count || 0), 0) || 0

  const tip = { contentStyle: { backgroundColor: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 12 } }

  return (
    <div className="@container">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Dashboard</h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 p-1 rounded-lg overflow-x-auto" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => setMonths(p.months)}
                className="px-3 md:px-2.5 py-2 md:py-1 text-xs rounded-md transition-all font-medium shrink-0"
                style={{
                  backgroundColor: months === p.months ? 'var(--color-surface)' : 'transparent',
                  color: months === p.months ? 'var(--color-text)' : 'var(--color-text-muted)',
                  boxShadow: months === p.months ? '0 1px 2px var(--color-card-shadow)' : 'none',
                }}>{p.label}</button>
            ))}
          </div>
          {isCustom && (
            <div className="flex items-center gap-1.5">
              <input type="date" className="theme-input px-2 py-1 text-xs" max={new Date().toISOString().slice(0, 10)} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>to</span>
              <input type="date" className="theme-input px-2 py-1 text-xs" max={new Date().toISOString().slice(0, 10)} value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {suspectedTransfers > 0 && (
        <div className="theme-card p-4 mb-6 flex flex-col @md:flex-row @md:items-center gap-3" style={{ borderLeft: '3px solid var(--color-warning)' }}>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm mb-0.5" style={{ color: 'var(--color-text)' }}>
              {suspectedTransfers} transaction{suspectedTransfers === 1 ? '' : 's'} flagged as possible transfers
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              These are <span className="font-medium">excluded</span> from your spending and income as suspected transfers. Review to confirm them — or catch any that are actually real income or expenses being left out.
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => navigate('/transactions?needs_review=true')}
              className="theme-btn-secondary px-3 py-1.5 text-xs whitespace-nowrap">Review in Transactions</button>
            <button onClick={() => askAurelia?.(
              `I have ${suspectedTransfers} transactions that are marked as transfers but still pending my review (needs_review = 1) — these are the only ones I need to decide on. Ignore transfers I've already confirmed (needs_review = 0). Right now all transfers are excluded from my spending and income, so if any of these ${suspectedTransfers} were flagged by mistake, real income or expenses are being left out. Help me confirm which are genuine account-to-account transfers (credit-card payments, moving money between my own accounts) versus real income or expenses (like an Interac e-transfer to a person) flagged by mistake. Start with a quick first pass over just these ${suspectedTransfers}: group them by the clearest signal — obvious recurring payments and matching equal-and-opposite pairs (you can look across all my transactions to find each one's matching leg) — and show me what you find. Keep this first look concise. Then briefly note what else you could dig into (repeated or round amounts, weekly/monthly cadence, description clues) and ask whether I'd like you to go deeper.`
            )}
              className="theme-btn-primary px-3 py-1.5 text-xs whitespace-nowrap">Figure it out with Aurelia</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Total Spend" value={formatDollars(totalSpend)} colorVar="--color-expense" />
        <SummaryCard label="Total Income" value={formatDollars(totalIncome)} colorVar="--color-income" />
        <SummaryCard label="Net" value={formatDollars(totalNet)} colorVar={totalNet >= 0 ? '--color-income' : '--color-expense'} />
        <SummaryCard label="Transactions" value={totalTxns.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 @lg:grid-cols-2 gap-5">
        <div className="theme-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Accounts</h3>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Last transaction</span>
          </div>
          <div className="space-y-3">
            {accounts.map(a => {
              const f = accountFreshness(a.last_transaction_date)
              return (
                <div key={a.id} className="flex items-center gap-3 min-w-0">
                  <InstitutionIcon institution={a.institution} iconUrl={a.icon_url} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{a.name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {a.institution}{a.account_type ? ` · ${a.account_type}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{formatShortDate(a.last_transaction_date)}</div>
                    <div className="text-[11px] flex items-center justify-end gap-1" style={{ color: f.stale ? 'var(--color-expense)' : 'var(--color-text-muted)' }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: f.dot }} />
                      {f.rel}
                    </div>
                  </div>
                </div>
              )
            })}
            {accounts.length === 0 && <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No accounts yet.</div>}
          </div>
        </div>

        <div className="theme-card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>Monthly Spending</h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={monthlyData} style={{ cursor: 'pointer' }} onClick={(e) => {
              if (e?.activeLabel) {
                const m = e.activeLabel
                goToTransactions({ date_from: `${m}-01`, date_to: `${m}-31` })
              }
            }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.text }} />
              <YAxis tick={{ fontSize: 11, fill: c.text }} tickFormatter={v => `$${v.toLocaleString()}`} />
              <Tooltip {...tip} formatter={v => `$${v.toLocaleString()}`} />
              <Bar dataKey="spend" fill={c.expense} name="Spending" radius={[4, 4, 0, 0]} />
              <Bar dataKey="income" fill={c.income} name="Income" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="theme-card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>Spending by Tier</h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie data={tierPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={isMobile ? 70 : 95} innerRadius={isMobile ? 30 : 45}
                label={isMobile ? ({ name }) => name : ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                style={{ cursor: 'pointer' }}
                onClick={(_, idx) => {
                  const tier = tierByName[tierPieData[idx]?.name]
                  if (tier) goToTransactions({ tier_id: tier.id })
                }}>
                {tierPieData.map((entry, i) => <Cell key={i} fill={entry.color || c.chart[i % c.chart.length]} />)}
              </Pie>
              <Tooltip {...tip} formatter={v => `$${v.toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="theme-card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>Top Categories</h3>
          <ResponsiveContainer width="100%" height={catChartHeight}>
            <BarChart data={topCategories} layout="vertical" style={{ cursor: 'pointer' }} onClick={(e) => {
              if (e?.activeLabel) {
                const cat = categoryByName[e.activeLabel]
                if (cat) goToTransactions({ category_id: cat.id })
              }
            }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis type="number" tick={{ fontSize: 11, fill: c.text }} tickFormatter={v => `$${v.toLocaleString()}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: c.text }} width={yAxisWidth} interval={0} />
              <Tooltip {...tip} formatter={v => `$${v.toLocaleString()}`} />
              <Bar dataKey="amount" fill={c.chart[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {topTags.length > 0 && (
          <div className="theme-card p-5">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>Top Tags</h3>
            <ResponsiveContainer width="100%" height={tagChartHeight}>
              <BarChart data={topTags} layout="vertical" style={{ cursor: 'pointer' }} onClick={(e) => {
                if (e?.activeLabel) {
                  const tag = tagById[e.activeLabel]
                  if (tag) goToTransactions({ tag_id: tag.id })
                }
              }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                <XAxis type="number" tick={{ fontSize: 11, fill: c.text }} tickFormatter={v => `$${v.toLocaleString()}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: c.text }} width={yAxisWidth} interval={0} />
                <Tooltip {...tip} formatter={v => `$${v.toLocaleString()}`} />
                <Bar dataKey="amount" fill={c.chart[2]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="theme-card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>Spending Trends by Tier</h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={trendChartData.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.text }} />
              <YAxis tick={{ fontSize: 11, fill: c.text }} tickFormatter={v => `$${v.toLocaleString()}`} />
              <Tooltip {...tip} formatter={v => `$${v.toLocaleString()}`} />
              <Legend />
              {trendChartData.tiers.map((tier, i) => (
                <Line key={tier} type="monotone" dataKey={tier} stroke={c.chart[i % c.chart.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
