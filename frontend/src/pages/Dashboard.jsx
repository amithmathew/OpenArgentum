import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { api } from '../api'
import { useTheme } from '../ThemeContext'
import useIsMobile from '../hooks/useIsMobile'

function formatDollars(cents) {
  return '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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
  const { theme } = useTheme()
  return useMemo(() => {
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
  }, [theme])
}

export default function Dashboard() {
  const [months, setMonths] = useState(12)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const c = useChartColors()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const chartHeight = isMobile ? 200 : 280
  const yAxisWidth = isMobile ? 70 : 110

  const goToTransactions = (filters) => {
    const params = new URLSearchParams({ ...dateRange, ...filters }).toString()
    navigate(`/transactions?${params}`)
  }

  const isCustom = months === -1

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories') })
  const { data: tiers = [] } = useQuery({ queryKey: ['tiers'], queryFn: () => api.get('/tiers') })

  const categoryByName = useMemo(() => Object.fromEntries(categories.map(c => [c.name, c])), [categories])
  const tierByName = useMemo(() => Object.fromEntries(tiers.map(t => [t.name, t])), [tiers])

  // Compute date range from months preset
  const dateRange = useMemo(() => {
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
  }, [months, isCustom, customFrom, customTo])

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

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Total Spend" value={formatDollars(totalSpend)} colorVar="--color-expense" />
        <SummaryCard label="Total Income" value={formatDollars(totalIncome)} colorVar="--color-income" />
        <SummaryCard label="Net" value={formatDollars(totalNet)} colorVar={totalNet >= 0 ? '--color-income' : '--color-expense'} />
        <SummaryCard label="Transactions" value={totalTxns.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 @lg:grid-cols-2 gap-5">
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
