import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { api } from '../api'
import { useTheme } from '../ThemeContext'
import TransactionNotes from '../components/TransactionNotes'

function formatDollars(cents) {
  return '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatAmount(cents) {
  const dollars = Math.abs(cents) / 100
  const formatted = dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cents < 0 ? `-$${formatted}` : `$${formatted}`
}

function ProjectCard({ project, onSelect, onDelete }) {
  const spent = project.total_spent_cents || 0
  const budget = project.budget_target_cents
  const progress = budget ? Math.min((spent / budget) * 100, 100) : null
  const overBudget = budget && spent > budget

  return (
    <div className="theme-card p-4 cursor-pointer transition-all hover:shadow-md" onClick={() => onSelect(project.id)}>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
        <span className="font-semibold text-sm flex-1" style={{ color: 'var(--color-text)' }}>{project.name}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{project.transaction_count} txns</span>
      </div>
      {project.description && (
        <p className="text-xs mb-2 truncate" style={{ color: 'var(--color-text-secondary)' }}>{project.description}</p>
      )}
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold" style={{ color: 'var(--color-expense)' }}>{formatDollars(spent)}</span>
        {budget && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>of {formatDollars(budget)}</span>
        )}
      </div>
      {progress !== null && (
        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
          <div className="h-full rounded-full transition-all" style={{
            width: `${progress}%`,
            backgroundColor: overBudget ? 'var(--color-danger)' : project.color,
          }} />
        </div>
      )}
      {project.start_date && (
        <div className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          {project.start_date}{project.end_date ? ` to ${project.end_date}` : ' — ongoing'}
        </div>
      )}
    </div>
  )
}

function CreateProjectForm({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', description: '', color: '#3b82f6', budget_target: '', start_date: '', end_date: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onCreate({
      name: form.name,
      description: form.description,
      color: form.color,
      budget_target_cents: form.budget_target ? Math.round(parseFloat(form.budget_target) * 100) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="theme-card p-4 space-y-3" style={{ borderColor: 'var(--color-accent)' }}>
      <div className="flex gap-2">
        <input className="theme-input flex-1 px-3 py-1.5 text-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Project name" autoFocus />
        <input type="color" className="h-8 w-10 rounded cursor-pointer" value={form.color} onChange={e => setForm({...form, color: e.target.value})} />
      </div>
      <input className="theme-input w-full px-3 py-1.5 text-sm" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description (optional)" />
      <div className="flex gap-2 flex-wrap">
        <input type="number" step="0.01" className="theme-input px-3 py-1.5 text-sm w-32" value={form.budget_target} onChange={e => setForm({...form, budget_target: e.target.value})} placeholder="Budget ($)" />
        <label className="flex items-center gap-1">
          <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>From</span>
          <input type="date" className="theme-input px-2 py-1.5 text-sm" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>To</span>
          <input type="date" className="theme-input px-2 py-1.5 text-sm" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="theme-btn-primary px-3 py-1.5 text-sm">Create Project</button>
        <button type="button" onClick={onClose} className="theme-btn-secondary px-3 py-1.5 text-sm">Cancel</button>
      </div>
    </form>
  )
}

function useChartColors() {
  const { theme } = useTheme()
  return useMemo(() => {
    const get = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
    return { text: get('--color-text-secondary'), grid: get('--color-border-light'), surface: get('--color-surface'), border: get('--color-border') }
  }, [theme])
}

function ProjectDetail({ projectId, onBack }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const c = useChartColors()
  const [expandedId, setExpandedId] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(null)

  const { data: project } = useQuery({ queryKey: ['project', projectId], queryFn: () => api.get(`/projects/${projectId}`) })
  const { data: txnData } = useQuery({ queryKey: ['project-txns', projectId], queryFn: () => api.get(`/projects/${projectId}/transactions`) })
  const { data: breakdown } = useQuery({ queryKey: ['project-breakdown', projectId], queryFn: () => api.get(`/projects/${projectId}/breakdown`) })

  const [removedId, setRemovedId] = useState(null)
  const unassignMutation = useMutation({
    mutationFn: (txnIds) => {
      setRemovedId(txnIds[0])
      return api.post('/projects/unassign', { transaction_ids: txnIds, project_id: projectId })
    },
    onSuccess: () => {
      // Brief delay so the user sees the "Removed" feedback before the row disappears
      setTimeout(() => {
        setRemovedId(null)
        queryClient.invalidateQueries({ queryKey: ['project', projectId] })
        queryClient.invalidateQueries({ queryKey: ['project-txns', projectId] })
        queryClient.invalidateQueries({ queryKey: ['project-breakdown', projectId] })
      }, 600)
    },
    onError: () => setRemovedId(null),
  })

  const updateMutation = useMutation({
    mutationFn: (data) => api.put(`/projects/${projectId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditing(false)
    },
  })

  const startEditing = () => {
    setEditForm({
      name: project.name || '',
      description: project.description || '',
      color: project.color || '#3b82f6',
      budget_target: project.budget_target_cents ? (project.budget_target_cents / 100).toString() : '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
    })
    setEditing(true)
  }

  const handleSave = () => {
    updateMutation.mutate({
      name: editForm.name,
      description: editForm.description,
      color: editForm.color,
      budget_target_cents: editForm.budget_target ? Math.round(parseFloat(editForm.budget_target) * 100) : null,
      start_date: editForm.start_date || null,
      end_date: editForm.end_date || null,
    })
  }

  if (!project) return null

  const spent = project.total_spent_cents || 0
  const budget = project.budget_target_cents
  const progress = budget ? Math.min((spent / budget) * 100, 100) : null
  const overBudget = budget && spent > budget
  const transactions = txnData?.items || []

  const breakdownData = (breakdown?.items || []).map(item => ({
    name: item.category,
    amount: Math.abs(item.total) / 100,
    category_id: item.category_id,
  }))

  const tip = { contentStyle: { backgroundColor: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 12 } }

  return (
    <div>
      <button onClick={onBack} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--color-accent-text)' }}>
        ← Back to Projects
      </button>

      {/* Header */}
      {editing ? (
        <div className="theme-card p-4 mb-6 space-y-3">
          <div className="flex gap-2">
            <input className="theme-input flex-1 px-3 py-1.5 text-sm font-semibold" value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Project name" autoFocus />
            <input type="color" className="h-8 w-10 rounded cursor-pointer" value={editForm.color}
              onChange={e => setEditForm({ ...editForm, color: e.target.value })} />
          </div>
          <input className="theme-input w-full px-3 py-1.5 text-sm" value={editForm.description}
            onChange={e => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description (optional)" />
          <div className="flex gap-2 flex-wrap">
            <input type="number" step="0.01" className="theme-input px-3 py-1.5 text-sm w-32" value={editForm.budget_target}
              onChange={e => setEditForm({ ...editForm, budget_target: e.target.value })} placeholder="Budget ($)" />
            <label className="flex items-center gap-1">
              <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>From</span>
              <input type="date" className="theme-input px-2 py-1.5 text-sm" value={editForm.start_date}
                onChange={e => setEditForm({ ...editForm, start_date: e.target.value })} />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>To</span>
              <input type="date" className="theme-input px-2 py-1.5 text-sm" value={editForm.end_date}
                onChange={e => setEditForm({ ...editForm, end_date: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!editForm.name.trim() || updateMutation.isPending}
              className="theme-btn-primary px-3 py-1.5 text-sm disabled:opacity-50">
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="theme-btn-secondary px-3 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: project.color }} />
            <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{project.name}</h2>
            <button onClick={startEditing} className="text-xs font-medium ml-1" style={{ color: 'var(--color-accent-text)' }}>Edit</button>
          </div>
          {(project.description || project.start_date) && (
            <div className="mt-1.5 ml-7 space-y-0.5">
              {project.description && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{project.description}</p>}
              {project.start_date && (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {project.start_date}{project.end_date ? ` to ${project.end_date}` : ' — ongoing'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="theme-card p-4">
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Spent</div>
          <div className="text-xl font-bold" style={{ color: 'var(--color-expense)' }}>{formatDollars(spent)}</div>
        </div>
        {budget && (
          <div className="theme-card p-4">
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Budget</div>
            <div className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{formatDollars(budget)}</div>
          </div>
        )}
        {budget && (
          <div className="theme-card p-4">
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Remaining</div>
            <div className="text-xl font-bold" style={{ color: overBudget ? 'var(--color-danger)' : 'var(--color-income)' }}>
              {overBudget ? '-' : ''}{formatDollars(Math.abs(budget - spent))}
            </div>
          </div>
        )}
        <div className="theme-card p-4">
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Transactions</div>
          <div className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{project.transaction_count}</div>
        </div>
      </div>

      {/* Budget progress */}
      {progress !== null && (
        <div className="theme-card p-4 mb-6">
          <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
            <span>{Math.round(progress)}% used</span>
            <span>{formatDollars(spent)} / {formatDollars(budget)}</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${progress}%`,
              backgroundColor: overBudget ? 'var(--color-danger)' : project.color,
            }} />
          </div>
        </div>
      )}

      {/* Category breakdown chart */}
      {breakdownData.length > 0 && (
        <div className="theme-card p-5 mb-6">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>Spending by Category</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, breakdownData.length * 35)}>
            <BarChart data={breakdownData} layout="vertical" style={{ cursor: 'pointer' }} onClick={(e) => {
              if (e?.activeLabel) {
                const item = breakdownData.find(d => d.name === e.activeLabel)
                const params = new URLSearchParams({ project_id: String(projectId) })
                if (item?.category_id) params.set('category_id', String(item.category_id))
                navigate(`/transactions?${params}`)
              }
            }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis type="number" tick={{ fontSize: 11, fill: c.text }} tickFormatter={v => `$${v.toLocaleString()}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: c.text }} width={110} />
              <Tooltip {...tip} formatter={v => `$${v.toLocaleString()}`} />
              <Bar dataKey="amount" fill={project.color} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Transaction list */}
      <div className="theme-card overflow-hidden">
        <div className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}>
          {transactions.length} transactions
        </div>
        {transactions.map(txn => (
          <div key={txn.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
            <div className={`flex items-center px-4 py-2.5 gap-3 text-sm cursor-pointer transition-all duration-300 hover:bg-[var(--color-surface-alt)] ${removedId === txn.id ? 'opacity-50' : ''}`}
              style={removedId === txn.id ? { backgroundColor: 'var(--color-warning-bg)' } : undefined}
              onClick={() => { if (removedId) return; setExpandedId(expandedId === txn.id ? null : txn.id) }}>
              <div className="w-16 md:w-20 shrink-0 text-xs" style={{ color: 'var(--color-text-muted)' }}>{txn.date}</div>
              <div className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-text)' }}>
                {removedId === txn.id ? <span style={{ color: 'var(--color-danger)' }}>Removed</span> : txn.description}
              </div>
              <div className={`w-20 md:w-24 text-right font-mono text-sm shrink-0 ${txn.amount_cents < 0 ? 'amount-expense' : 'amount-income'}`}>
                {formatAmount(txn.amount_cents)}
              </div>
              <button onClick={(e) => { e.stopPropagation(); if (confirm(`Remove "${txn.description}" from this project?`)) unassignMutation.mutate([txn.id]) }}
                disabled={!!removedId}
                className="text-xs shrink-0 hidden md:block disabled:opacity-30" style={{ color: 'var(--color-danger)' }}>Remove</button>
            </div>
            {expandedId === txn.id && (
              <div className="px-3 md:px-4 pb-3 pt-1" style={{ paddingLeft: window.innerWidth < 768 ? 12 : 60, backgroundColor: 'var(--color-surface-alt)' }}>
                <div className="grid grid-cols-2 gap-x-4 md:gap-x-8 gap-y-1 text-xs" style={{ maxWidth: window.innerWidth < 768 ? '100%' : 500 }}>
                  {txn.account_name && (
                    <>
                      <span style={{ color: 'var(--color-text-muted)' }}>Account</span>
                      <span style={{ color: 'var(--color-text-secondary)' }}>{txn.account_name}</span>
                    </>
                  )}
                  {txn.description_raw && (
                    <>
                      <span style={{ color: 'var(--color-text-muted)' }}>Raw description</span>
                      <span style={{ color: 'var(--color-text-secondary)' }}>{txn.description_raw}</span>
                    </>
                  )}
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
                        View statement
                      </a>
                    </>
                  )}
                </div>
                <TransactionNotes transactionId={txn.id} />
                <button onClick={() => { if (confirm(`Remove "${txn.description}" from this project?`)) unassignMutation.mutate([txn.id]) }}
                  className="md:hidden mt-2 text-xs font-medium px-3 py-1.5 rounded-md" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-danger)' }}>
                  Remove from project
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Projects() {
  const queryClient = useQueryClient()
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => api.get('/projects') })
  const createProject = useMutation({
    mutationFn: (data) => api.post('/projects', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
  const deleteProject = useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  if (selectedProjectId) {
    return <ProjectDetail projectId={selectedProjectId} onBack={() => setSelectedProjectId(null)} />
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Projects</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="theme-btn-primary px-3 py-1.5 text-sm">
          {showCreate ? 'Cancel' : '+ New Project'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-6">
          <CreateProjectForm onClose={() => setShowCreate(false)} onCreate={(data) => createProject.mutate(data)} />
        </div>
      )}

      {projects.length === 0 && !showCreate ? (
        <div className="theme-card p-8 text-center">
          <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>No projects yet.</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Create a project to group transactions together — like "India Trip" or "Home Renovation".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onSelect={setSelectedProjectId}
              onDelete={(id) => { if (confirm(`Delete "${project.name}"?`)) deleteProject.mutate(id) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
