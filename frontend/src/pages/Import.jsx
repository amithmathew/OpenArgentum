import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import InstitutionIcon from '../components/InstitutionIcon'

function SortHeader({ label, field, sortBy, sortDir, onSort, align = 'left' }) {
  const active = sortBy === field
  return (
    <th
      className={`${align === 'right' ? 'text-right' : 'text-left'} px-4 py-2.5 font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:opacity-80`}
      style={{ color: active ? 'var(--color-accent-text)' : 'var(--color-text-muted)' }}
      onClick={() => onSort(field)}
    >
      {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )
}

function UploadZone({ onUpload, isUploading }) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const allowed = ['.pdf', '.csv', '.zip']
    const files = Array.from(e.dataTransfer.files).filter(f => allowed.some(ext => f.name.toLowerCase().endsWith(ext)))
    if (files.length) onUpload(files)
  }, [onUpload])

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length) onUpload(files)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className="border-2 border-dashed rounded-xl p-8 text-center transition-all"
      style={{
        borderColor: dragOver ? 'var(--color-accent)' : 'var(--color-border)',
        backgroundColor: dragOver ? 'var(--color-accent-light)' : 'transparent',
        opacity: isUploading ? 0.5 : 1,
        pointerEvents: isUploading ? 'none' : 'auto',
      }}
    >
      <div className="text-3xl mb-3" style={{ color: 'var(--color-text-muted)' }}>&#8593;</div>
      <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
        {isUploading ? 'Uploading...' : 'Drop PDF, CSV, or ZIP files here'}
      </p>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>Accounts are auto-detected from statement contents</p>
      <input type="file" accept=".pdf,.csv,.zip" multiple onChange={handleFileSelect} className="hidden" id="file-upload" />
      <label htmlFor="file-upload" className="theme-btn-primary inline-block px-4 py-2 text-sm cursor-pointer">
        Select Files
      </label>
    </div>
  )
}

const STATUS_COLORS = {
  pending: { bg: '--color-surface-alt', text: '--color-text-secondary' },
  queued: { bg: '--color-badge-manual-bg', text: '--color-badge-manual-text' },
  processing: { bg: '--color-accent-light', text: '--color-accent-text' },
  completed: { bg: '--color-badge-auto-bg', text: '--color-success' },
  needs_account: { bg: '--color-warning-bg', text: '--color-warning' },
  failed: { bg: '--color-warning-bg', text: '--color-danger' },
}

function AccountAssigner({ stmtId, accounts, currentAccountId, onAssign, onCreate }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [accountType, setAccountType] = useState('checking')

  const institutions = [...new Set(accounts.map(a => a.institution).filter(Boolean))]
  const listId = `inst-list-${stmtId}`

  if (creating) {
    return (
      <div className="flex flex-col gap-1.5">
        <input className="theme-input px-2 py-1 text-xs" value={name} onChange={e => setName(e.target.value)} placeholder="Account name" autoFocus />
        <input className="theme-input px-2 py-1 text-xs" value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Institution" list={listId} />
        <datalist id={listId}>
          {institutions.map(inst => <option key={inst} value={inst} />)}
        </datalist>
        <select className="theme-input px-2 py-1 text-xs" value={accountType} onChange={e => setAccountType(e.target.value)}>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
          <option value="credit">Credit Card</option>
          <option value="line_of_credit">Line of Credit</option>
          <option value="investment">Investment</option>
        </select>
        <div className="flex gap-1">
          <button onClick={() => {
            if (!name.trim()) return
            onCreate(stmtId, { name, institution, account_type: accountType })
            setCreating(false)
          }} className="theme-btn-primary px-2 py-0.5 text-xs">Save</button>
          <button onClick={() => setCreating(false)} className="theme-btn-secondary px-2 py-0.5 text-xs">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <select
      className="theme-input px-2 py-1 text-xs flex-1"
      value={currentAccountId || ''}
      onChange={e => {
        if (e.target.value === '__new__') setCreating(true)
        else onAssign(stmtId, e.target.value ? parseInt(e.target.value) : null)
      }}
    >
      <option value="">Auto-detect</option>
      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      <option value="__new__">+ Create new account</option>
    </select>
  )
}

function formatImported(dt) {
  if (!dt) return ''
  const d = new Date(dt + 'Z')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function StatementRow({ stmt, accounts, selected, onToggleSelect, onDelete, onIngest, onAssignAccount, onCreateAndAssign, showAccount = true, showImported = false }) {
  const [deleting, setDeleting] = useState(false)
  const sc = STATUS_COLORS[stmt.status] || STATUS_COLORS.pending
  const isSelected = selected.has(stmt.id)
  return (
    <tr key={stmt.id} style={isSelected ? { backgroundColor: 'var(--color-accent-light)' } : undefined}>
      <td className="px-4 py-2.5">
        <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(stmt.id)}
          className="cursor-pointer accent-[var(--color-accent)]" />
      </td>
      <td className="px-4 py-2.5">
        <a href={`/api/statements/${stmt.id}/file`} target="_blank" rel="noopener noreferrer"
          className="font-medium truncate max-w-xs block hover:underline" style={{ color: 'var(--color-accent-text)' }}>{stmt.filename}</a>
      </td>
      <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
        {stmt.statement_period_start ? (
          <>{stmt.statement_period_start}<br/>{stmt.statement_period_end && `to ${stmt.statement_period_end}`}</>
        ) : '—'}
      </td>
      {showAccount && (
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-4 shrink-0 flex justify-center">
              {!!stmt.account_id && <InstitutionIcon institution={stmt.account_institution} iconUrl={stmt.account_icon_url} size={16} />}
            </div>
            <AccountAssigner stmtId={stmt.id} accounts={accounts} currentAccountId={stmt.account_id}
              onAssign={onAssignAccount} onCreate={onCreateAndAssign} />
          </div>
        </td>
      )}
      <td className="px-4 py-2.5" style={{ maxWidth: 180 }}>
        <span className="theme-badge" style={{ backgroundColor: `var(${sc.bg})`, color: `var(${sc.text})` }}>
          {stmt.status}
        </span>
        {stmt.status === 'processing' && stmt.error_message && (
          <div className="text-xs mt-1 truncate" style={{ color: 'var(--color-accent-text)' }}>{stmt.error_message}</div>
        )}
        {stmt.status === 'failed' && stmt.error_message && (
          <div className="text-xs mt-1 truncate" style={{ color: 'var(--color-danger)' }} title={stmt.error_message}>{stmt.error_message}</div>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{stmt.transaction_count}</td>
      {showImported && (
        <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>{formatImported(stmt.uploaded_at)}</td>
      )}
      <td className="px-4 py-2.5 text-right space-x-2">
        <button onClick={() => onIngest(stmt.id)} disabled={stmt.status === 'processing' || stmt.status === 'queued'}
          className="text-xs font-medium disabled:opacity-40" style={{ color: 'var(--color-accent-text)' }}>
          {stmt.status === 'completed' ? 'Re-ingest' : stmt.status === 'queued' ? 'Queued' : 'Ingest'}
        </button>
        <button onClick={async () => {
            if (!confirm('Delete this statement and all its transactions?')) return
            setDeleting(true)
            try { await onDelete(stmt.id) } finally { setDeleting(false) }
          }}
          disabled={deleting}
          className="text-xs font-medium disabled:opacity-50" style={{ color: 'var(--color-danger)' }}>
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </td>
    </tr>
  )
}

function StatementList({ statements, accounts, onDelete, onIngest, onAssignAccount, onCreateAndAssign, selected, onToggleSelect, onSelectAll, groupBy }) {
  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    return [...statements].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'filename') cmp = a.filename.localeCompare(b.filename)
      else if (sortBy === 'account') cmp = (a.account_name || '').localeCompare(b.account_name || '')
      else if (sortBy === 'status') cmp = a.status.localeCompare(b.status)
      else if (sortBy === 'transaction_count') cmp = (a.transaction_count || 0) - (b.transaction_count || 0)
      else if (sortBy === 'date') cmp = (a.statement_period_start || '').localeCompare(b.statement_period_start || '')
      else if (sortBy === 'uploaded_at') cmp = (a.uploaded_at || '').localeCompare(b.uploaded_at || '')
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [statements, sortBy, sortDir])

  if (!statements.length) {
    return <p className="text-sm mt-4" style={{ color: 'var(--color-text-muted)' }}>No statements imported yet.</p>
  }

  const rowProps = { accounts, selected, onToggleSelect, onDelete, onIngest, onAssignAccount, onCreateAndAssign }

  if (groupBy && groupBy !== 'none') {
    const groups = new Map()
    for (const stmt of sorted) {
      let key, label, institution = null, iconUrl = null
      if (groupBy === 'account') {
        key = stmt.account_id || 0
        label = stmt.account_name || 'Unassigned'
        institution = stmt.account_institution
        iconUrl = stmt.account_icon_url
      } else if (groupBy === 'month') {
        // Use statement_period_end for grouping (represents the statement's month)
        // Fall back to statement_period_start, then uploaded_at
        const period = stmt.statement_period_end || stmt.statement_period_start || stmt.uploaded_at || ''
        key = period.slice(0, 7) || '0000-00'
        label = key === '0000-00' ? 'Unknown period' : new Date(key + '-15').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      } else if (groupBy === 'status') {
        key = stmt.status
        label = stmt.status.charAt(0).toUpperCase() + stmt.status.slice(1)
      }
      if (!groups.has(key)) {
        groups.set(key, {
          accountId: groupBy === 'account' ? (stmt.account_id || 0) : key,
          accountName: label,
          institution,
          iconUrl,
          statements: [],
        })
      }
      groups.get(key).statements.push(stmt)
    }

    // Sort groups: by date descending for month, alphabetically for others
    let sortedGroups = [...groups.entries()]
    if (groupBy === 'month') {
      sortedGroups.sort((a, b) => b[0].localeCompare(a[0])) // descending date
    } else {
      sortedGroups.sort((a, b) => String(a[1].accountName).localeCompare(String(b[1].accountName)))
    }

    const showIcon = groupBy === 'account' // only show institution icon for account grouping

    return (
      <div className="mt-6 space-y-4">
        {sortedGroups.map(([gKey, group]) => (
          <AccountGroup key={gKey} group={group} sortBy={sortBy} sortDir={sortDir}
            onSort={handleSort} onSelectAll={onSelectAll} rowProps={rowProps} allSelected={selected}
            showAccount={groupBy !== 'account'} showIcon={showIcon} />
        ))}
      </div>
    )
  }

  const allSelected = statements.length > 0 && statements.every(s => selected.has(s.id))
  const someSelected = statements.some(s => selected.has(s.id)) && !allSelected

  return (
    <div className="theme-card overflow-x-auto mt-6">
      <table className="w-full text-sm theme-table min-w-[600px]">
        <thead>
          <tr>
            <th className="text-left px-4 py-2.5 w-10">
              <input type="checkbox" checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected }}
                onChange={() => onSelectAll(statements.map(s => s.id))}
                className="cursor-pointer accent-[var(--color-accent)]" />
            </th>
            <SortHeader label="Filename" field="filename" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Statement Date" field="date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Account" field="account" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Txns" field="transaction_count" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
            <SortHeader label="Imported" field="uploaded_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
            <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(stmt => (
            <StatementRow key={stmt.id} stmt={stmt} showAccount={true} showImported={true} {...rowProps} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AccountGroup({ group, sortBy, sortDir, onSort, onSelectAll, rowProps, allSelected, showAccount = false, showIcon = true }) {
  const [collapsed, setCollapsed] = useState(false)
  const stmtIds = group.statements.map(s => s.id)
  const groupAllSelected = stmtIds.every(id => allSelected.has(id))
  const groupSomeSelected = stmtIds.some(id => allSelected.has(id)) && !groupAllSelected
  const totalTxns = group.statements.reduce((sum, s) => sum + (s.transaction_count || 0), 0)

  return (
    <div className="theme-card overflow-hidden">
      {/* Group header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none"
        style={{ backgroundColor: 'var(--color-surface-alt)' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <input type="checkbox" checked={groupAllSelected}
          ref={el => { if (el) el.indeterminate = groupSomeSelected }}
          onClick={e => e.stopPropagation()}
          onChange={() => onSelectAll(stmtIds)}
          className="cursor-pointer accent-[var(--color-accent)]" />
        <svg className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} style={{ color: 'var(--color-text-muted)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {showIcon && <InstitutionIcon institution={group.institution} iconUrl={group.iconUrl} size={18} />}
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{group.accountName}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {group.statements.length} statement{group.statements.length !== 1 ? 's' : ''} · {totalTxns} txns
        </span>
      </div>
      {/* Group rows */}
      {!collapsed && (
        <div className="overflow-x-auto"><table className="w-full text-sm theme-table min-w-[600px]">
          <thead>
            <tr>
              <th className="text-left px-4 py-2 w-10" />
              <SortHeader label="Filename" field="filename" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Statement Date" field="date" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              {showAccount && <SortHeader label="Account" field="account" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />}
              <SortHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Txns" field="transaction_count" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
              <SortHeader label="Imported" field="uploaded_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
              <th className="text-right px-4 py-2 font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {group.statements.map(stmt => (
              <StatementRow key={stmt.id} stmt={stmt} showAccount={showAccount} showImported={true} {...rowProps} />
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}

export default function Import() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState(new Set())
  const [bulkInProgress, setBulkInProgress] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupBy, setGroupBy] = useState('account') // 'none', 'account', 'month', 'status'

  const { data: statements = [] } = useQuery({
    queryKey: ['statements'],
    queryFn: () => api.get('/statements'),
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && data.some(s => s.status === 'processing' || s.status === 'queued')) return 2000
      return false
    },
  })

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') })

  const uploadMutation = useMutation({
    mutationFn: async (files) => {
      const formData = new FormData()
      files.forEach(f => formData.append('files', f))
      return api.upload('/statements/upload', formData)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['statements'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/statements/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['statements'] }),
  })

  const ingestMutation = useMutation({
    mutationFn: (id) => api.post(`/statements/${id}/ingest`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['statements'] }),
  })

  const ingestAllMutation = useMutation({
    mutationFn: () => api.post('/statements/ingest-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['statements'] }),
  })

  const assignAccountMutation = useMutation({
    mutationFn: ({ statementId, accountId }) => api.patch(`/statements/${statementId}`, { account_id: accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })

  const createAndAssignAccount = async (statementId, accountData) => {
    const newAccount = await api.post('/accounts', accountData)
    await api.patch(`/statements/${statementId}`, { account_id: newAccount.id })
    queryClient.invalidateQueries({ queryKey: ['statements'] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
  }

  // Selection handlers
  const handleToggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback((allIds) => {
    setSelected(prev => {
      const allSelected = allIds.every(id => prev.has(id))
      if (allSelected) {
        // Deselect all
        return new Set()
      } else {
        // Select all
        return new Set(allIds)
      }
    })
  }, [])

  // Bulk actions
  const handleBulkIngest = useCallback(async () => {
    if (selected.size === 0) return
    setBulkInProgress(true)
    try {
      const promises = Array.from(selected).map(id => api.post(`/statements/${id}/ingest`))
      await Promise.all(promises)
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      setSelected(new Set())
    } catch {
      // Even if some fail, refresh and keep going
      queryClient.invalidateQueries({ queryKey: ['statements'] })
    } finally {
      setBulkInProgress(false)
    }
  }, [selected, queryClient])

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} selected statement(s) and all their transactions? This cannot be undone.`)) return
    setBulkInProgress(true)
    try {
      const promises = Array.from(selected).map(id => api.delete(`/statements/${id}`))
      await Promise.all(promises)
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      setSelected(new Set())
    } catch {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
    } finally {
      setBulkInProgress(false)
    }
  }, [selected, queryClient])

  const filteredStatements = useMemo(() => {
    if (statusFilter === 'all') return statements
    if (statusFilter === 'processing') return statements.filter(s => s.status === 'processing' || s.status === 'queued')
    return statements.filter(s => s.status === statusFilter)
  }, [statements, statusFilter])

  const pendingCount = statements.filter(s => s.status === 'pending').length
  const failedCount = statements.filter(s => s.status === 'failed').length
  const completedCount = statements.filter(s => s.status === 'completed').length
  const processingCount = statements.filter(s => s.status === 'processing' || s.status === 'queued').length
  const actionableCount = pendingCount + failedCount
  const selectedCount = selected.size

  // Build breakdown label for Ingest All
  const ingestParts = []
  if (pendingCount > 0) ingestParts.push(`${pendingCount} pending`)
  if (failedCount > 0) ingestParts.push(`${failedCount} failed`)
  const ingestLabel = ingestParts.length > 0 ? `Ingest All (${ingestParts.join(', ')})` : 'Ingest All'

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Import Statements</h2>
        <div className="flex gap-2">
          {actionableCount > 0 && (
            <button onClick={() => ingestAllMutation.mutate()} disabled={ingestAllMutation.isPending}
              className="theme-btn-primary px-3 py-1.5 text-xs">
              {ingestAllMutation.isPending ? 'Queuing...' : ingestLabel}
            </button>
          )}
          {completedCount > 0 && (
            <button onClick={() => {
              if (confirm(`Re-ingest all ${statements.length} statements? This will re-extract and re-categorize everything.`)) {
                api.post('/statements/ingest-all', { statuses: ['pending', 'failed', 'completed'] })
                  .then(() => queryClient.invalidateQueries({ queryKey: ['statements'] }))
              }
            }} className="theme-btn-secondary px-3 py-1.5 text-xs">
              Re-ingest All ({statements.length})
            </button>
          )}
        </div>
      </div>

      <UploadZone onUpload={(files) => uploadMutation.mutate(files)} isUploading={uploadMutation.isPending} />

      {uploadMutation.isError && (
        <div className="mt-3 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', color: 'var(--color-danger)' }}>
          {uploadMutation.error.message}
        </div>
      )}

      {/* Filter tabs + view toggle */}
      {statements.length > 0 && (
        <div className="flex items-center justify-between mt-5 mb-1">
          <div className="flex gap-1.5">
            {[
              { id: 'all', label: 'All', count: statements.length },
              ...(pendingCount > 0 ? [{ id: 'pending', label: 'Pending', count: pendingCount }] : []),
              ...(processingCount > 0 ? [{ id: 'processing', label: 'Processing', count: processingCount }] : []),
              ...(completedCount > 0 ? [{ id: 'completed', label: 'Completed', count: completedCount }] : []),
              ...(failedCount > 0 ? [{ id: 'failed', label: 'Failed', count: failedCount }] : []),
            ].map(tab => (
              <button key={tab.id} onClick={() => setStatusFilter(tab.id)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg transition-all"
                style={{
                  backgroundColor: statusFilter === tab.id ? 'var(--color-accent-light)' : 'var(--color-surface)',
                  color: statusFilter === tab.id ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-light)',
                }}>
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <select className="theme-input px-2 py-1 text-xs" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            <option value="none">No grouping</option>
            <option value="account">Group by account</option>
            <option value="month">Group by month</option>
            <option value="status">Group by status</option>
          </select>
        </div>
      )}

      {selectedCount > 0 && (
        <div
          className="mt-4 px-4 py-3 rounded-lg flex items-center justify-between flex-wrap gap-2"
          style={{ backgroundColor: 'var(--color-accent-light)', border: '1px solid var(--color-accent)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-accent-text)' }}>
            {selectedCount} statement{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2 flex-wrap">
            <select
              className="theme-input px-2 py-1.5 text-xs"
              value=""
              disabled={bulkInProgress}
              onChange={async (e) => {
                if (!e.target.value) return
                const accountId = parseInt(e.target.value)
                setBulkInProgress(true)
                try {
                  await Promise.all(Array.from(selected).map(id => api.patch(`/statements/${id}`, { account_id: accountId })))
                  queryClient.invalidateQueries({ queryKey: ['statements'] })
                  queryClient.invalidateQueries({ queryKey: ['transactions'] })
                } finally {
                  setBulkInProgress(false)
                }
              }}
            >
              <option value="">Assign account...</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button
              onClick={handleBulkIngest}
              disabled={bulkInProgress}
              className="theme-btn-primary px-3 py-1.5 text-xs"
            >
              {bulkInProgress ? 'Processing...' : `Re-ingest (${selectedCount})`}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkInProgress}
              className="px-3 py-1.5 text-xs font-medium rounded-md"
              style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}
            >
              {bulkInProgress ? 'Processing...' : `Delete (${selectedCount})`}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="theme-btn-secondary px-3 py-1.5 text-xs"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <StatementList
        statements={filteredStatements}
        accounts={accounts}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        onIngest={(id) => ingestMutation.mutate(id)}
        onAssignAccount={(statementId, accountId) => assignAccountMutation.mutate({ statementId, accountId })}
        onCreateAndAssign={createAndAssignAccount}
        selected={selected}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        groupBy={groupBy}
      />
    </div>
  )
}
