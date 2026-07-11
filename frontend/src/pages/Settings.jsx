import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useTheme } from '../theme-context'
import InstitutionIcon from '../components/InstitutionIcon'

function ActionButton({ label, description, confirmText, variant = 'default', onAction }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const handleClick = async () => {
    if (confirmText && !confirm(confirmText)) return
    setLoading(true)
    setResult(null)
    try {
      const res = await onAction()
      setResult({ ok: true, message: res.message || 'Done' })
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setLoading(false)
    }
  }

  const btnClass = variant === 'danger' ? 'theme-btn-danger' : variant === 'warning' ? 'theme-btn-primary' : 'theme-btn-primary'

  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between py-4 gap-2" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
      <div className="flex-1 md:mr-4">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{description}</div>
        {result && (
          <div className="text-xs mt-1" style={{ color: result.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {result.message}
          </div>
        )}
      </div>
      <button onClick={handleClick} disabled={loading} className={`${btnClass} px-4 py-1.5 text-sm`}>
        {loading ? 'Working...' : label}
      </button>
    </div>
  )
}

function AccountRow({ account, accounts, onUpdate, onMerge, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: account.name,
    institution: account.institution,
    account_type: account.account_type,
    account_number: account.account_number || '',
    account_holder: account.account_holder || '',
    icon_url: account.icon_url || '',
  })
  const [mergeTarget, setMergeTarget] = useState('')

  const handleSave = () => {
    onUpdate(account.id, form)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="p-4" style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-accent-light)' }}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Display Name</label>
            <input className="theme-input w-full px-2 py-1.5 text-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Institution</label>
            <input className="theme-input w-full px-2 py-1.5 text-sm" value={form.institution} onChange={e => setForm({...form, institution: e.target.value})} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Type</label>
            <select className="theme-input w-full px-2 py-1.5 text-sm" value={form.account_type} onChange={e => setForm({...form, account_type: e.target.value})}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
              <option value="line_of_credit">Line of Credit</option>
              <option value="investment">Investment</option>
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Account Number</label>
            <input className="theme-input w-full px-2 py-1.5 text-sm" value={form.account_number} onChange={e => setForm({...form, account_number: e.target.value})} placeholder="Optional" />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Account Holder</label>
            <input className="theme-input w-full px-2 py-1.5 text-sm" value={form.account_holder} onChange={e => setForm({...form, account_holder: e.target.value})} placeholder="Optional" />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Icon URL</label>
            <div className="flex gap-2 items-center">
              <input className="theme-input flex-1 px-2 py-1.5 text-sm" value={form.icon_url} onChange={e => setForm({...form, icon_url: e.target.value})} placeholder="https://... or leave blank for auto" />
              {form.icon_url && <InstitutionIcon iconUrl={form.icon_url} size={24} />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} className="theme-btn-primary px-3 py-1.5 text-xs">Save</button>
          <button onClick={() => setEditing(false)} className="theme-btn-secondary px-3 py-1.5 text-xs">Cancel</button>
          {accounts.length > 1 && (
            <div className="ml-auto flex items-center gap-1">
              <select
                className="theme-input px-2 py-1 text-xs"
                value={mergeTarget}
                onChange={e => {
                  if (e.target.value && confirm(`Merge "${account.name}" into the selected account? This moves all statements and transactions and cannot be undone.`)) {
                    onMerge(account.id, parseInt(e.target.value))
                    setEditing(false)
                  }
                  setMergeTarget('')
                }}
              >
                <option value="">Merge into...</option>
                {accounts.filter(a => a.id !== account.id).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center px-4 py-3 gap-4 group" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
      <InstitutionIcon institution={account.institution} iconUrl={account.icon_url} size={28} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>{account.name}</div>
        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
          {account.account_type}
          {account.account_number && ` · #${account.account_number}`}
          {` · ${account.statement_count} statements · ${account.transaction_count} txns`}
        </div>
      </div>
      <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)} className="text-xs font-medium px-2 py-1.5 md:px-0 md:py-0" style={{ color: 'var(--color-accent-text)' }}>Edit</button>
        <button onClick={() => { if (confirm(`Delete "${account.name}"? Statements and transactions will be unlinked.`)) onDelete(account.id) }}
          className="text-xs font-medium px-2 py-1.5 md:px-0 md:py-0" style={{ color: 'var(--color-danger)' }}>Delete</button>
      </div>
    </div>
  )
}

function LLMConfig() {
  const [config, setConfig] = useState(null)
  const [provider, setProvider] = useState('api_key')
  const [apiKey, setApiKey] = useState('')
  const [gcpProject, setGcpProject] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [chatModel, setChatModel] = useState('')
  const [documentModel, setDocumentModel] = useState('')
  const [modelSaving, setModelSaving] = useState(false)
  const [modelResult, setModelResult] = useState(null)
  const [changeSetCap, setChangeSetCap] = useState('')
  const [capSaving, setCapSaving] = useState(false)
  const [capResult, setCapResult] = useState(null)

  useEffect(() => {
    api.get('/settings/app-config').then(c => {
      setConfig(c)
      if (c.llm_provider && c.llm_provider !== 'none') setProvider(c.llm_provider)
      if (c.chat_model) setChatModel(c.chat_model)
      if (c.document_model) setDocumentModel(c.document_model)
      if (c.change_set_cap != null) setChangeSetCap(String(c.change_set_cap))
    })
  }, [])

  const handleSave = async () => {
    setTesting(true)
    setResult(null)
    try {
      const body = provider === 'api_key'
        ? { provider: 'api_key', api_key: apiKey }
        : { provider: 'adc', gcp_project: gcpProject || null }
      const res = await api.post('/settings/setup-llm', body)
      setResult({ ok: true, message: res.message })
      setApiKey('')
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="theme-card p-5 mb-6">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>LLM Configuration</h3>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Current:</span>
        <span className="theme-badge" style={{
          backgroundColor: config?.llm_configured ? 'var(--color-badge-auto-bg)' : 'var(--color-warning-bg)',
          color: config?.llm_configured ? 'var(--color-success)' : 'var(--color-warning)',
        }}>
          {config?.llm_configured ? `${config.llm_provider === 'adc' ? 'GCP ADC' : 'API Key'} configured` : 'Not configured'}
        </span>
      </div>

      <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-text-secondary)' }}>
        <p className="mb-1 font-semibold" style={{ color: 'var(--color-text)' }}>How Google handles your data</p>
        <p className="mb-1.5">
          Your statements are sent to Google Gemini. We recommend Google's <strong>paid</strong> data terms — enable{' '}
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)' }}>Cloud Billing</a>{' '}
          on your API key's project, or use GCP credentials (Vertex AI). Under the paid terms, Google <strong>doesn't use your prompts or responses to train its models</strong> or have them reviewed by humans, and processes them under its{' '}
          <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)' }}>Data Processing Addendum</a>. Billing status — not spend — is what applies these terms, so you can stay within the free quota.
        </p>
        <p className="mb-1.5">
          A free key with no billing uses the <strong>unpaid</strong> tier, where Google uses your content to improve its products and human reviewers may read it. Google's terms state: <em>“Do not submit sensitive, confidential, or personal information to the Unpaid Services.”</em> Bank statements are exactly that, so we don't recommend the free tier for real financial data.
        </p>
        <p style={{ color: 'var(--color-text-muted)' }}>
          These terms are Google's and can change at any time — you're responsible for reviewing the current{' '}
          <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)' }}>Gemini API terms</a>.
        </p>
      </div>

      <div className="flex gap-2 mb-3">
        <button onClick={() => setProvider('api_key')}
          className="px-3 py-1 text-xs font-medium rounded-lg"
          style={{
            backgroundColor: provider === 'api_key' ? 'var(--color-accent-light)' : 'var(--color-surface-alt)',
            color: provider === 'api_key' ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
          }}>API Key</button>
        <button onClick={() => setProvider('adc')}
          className="px-3 py-1 text-xs font-medium rounded-lg"
          style={{
            backgroundColor: provider === 'adc' ? 'var(--color-accent-light)' : 'var(--color-surface-alt)',
            color: provider === 'adc' ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
          }}>GCP ADC</button>
      </div>
      {provider === 'api_key' ? (
        <>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Get a free API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)' }}>Google AI Studio</a>.
          </p>
          <input className="theme-input w-full px-3 py-1.5 text-sm mb-3" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste new Gemini API key..." />
        </>
      ) : (
        <input className="theme-input w-full px-3 py-1.5 text-sm mb-3" value={gcpProject} onChange={e => setGcpProject(e.target.value)} placeholder="GCP Project ID" />
      )}
      <button onClick={handleSave} disabled={testing || (provider === 'api_key' && !apiKey.trim())} className="theme-btn-primary px-4 py-1.5 text-sm disabled:opacity-50">
        {testing ? 'Testing...' : 'Test & Save'}
      </button>
      {result && (
        <div className="mt-2 text-xs" style={{ color: result.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {result.ok ? '✓ ' : '✗ '}{result.message}
        </div>
      )}

      {/* Advanced model settings — hidden by default */}
      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border-light)' }}>
        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
          <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Advanced model settings
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Override the AI model used for different tasks. Leave blank to use the default (gemini-2.5-flash).
            </p>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Chat model (Aurelia)</label>
              <input className="theme-input w-full px-3 py-1.5 text-sm mt-1" value={chatModel} onChange={e => setChatModel(e.target.value)}
                placeholder="gemini-2.5-flash" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Document processing model (ingestion & categorization)</label>
              <input className="theme-input w-full px-3 py-1.5 text-sm mt-1" value={documentModel} onChange={e => setDocumentModel(e.target.value)}
                placeholder="gemini-2.5-flash" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={async () => {
                setModelSaving(true); setModelResult(null)
                try {
                  const res = await api.post('/settings/models', { chat_model: chatModel, document_model: documentModel })
                  setChatModel(res.chat_model); setDocumentModel(res.document_model)
                  setModelResult({ ok: true, message: `Chat: ${res.chat_model}, Document: ${res.document_model}` })
                } catch (e) {
                  setModelResult({ ok: false, message: e.message })
                } finally { setModelSaving(false) }
              }} disabled={modelSaving}
                className="theme-btn-primary px-4 py-1.5 text-sm disabled:opacity-50">
                {modelSaving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setChatModel(''); setDocumentModel('') }}
                className="theme-btn-secondary px-3 py-1.5 text-sm">Reset to default</button>
            </div>
            {modelResult && (
              <div className="text-xs" style={{ color: modelResult.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {modelResult.ok ? '✓ ' : '✗ '}{modelResult.message}
              </div>
            )}

            <div className="pt-3" style={{ borderTop: '1px solid var(--color-border-light)' }}>
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Aurelia approval-set limit</label>
              <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Max number of edits Aurelia may bundle into one approval set. Larger sets are still gated by your approval; smaller keeps each set easy to review.
              </p>
              <div className="flex items-center gap-2">
                <input type="number" min="1" max="500" className="theme-input w-24 px-3 py-1.5 text-sm" value={changeSetCap}
                  onChange={e => setChangeSetCap(e.target.value)} placeholder="50" />
                <button onClick={async () => {
                  setCapSaving(true); setCapResult(null)
                  try {
                    const res = await api.post('/settings/change-set-cap', { cap: Number(changeSetCap) })
                    setChangeSetCap(String(res.change_set_cap))
                    setCapResult({ ok: true, message: `Limit set to ${res.change_set_cap}` })
                  } catch (e) {
                    setCapResult({ ok: false, message: e.message })
                  } finally { setCapSaving(false) }
                }} disabled={capSaving || !changeSetCap}
                  className="theme-btn-primary px-4 py-1.5 text-sm disabled:opacity-50">
                  {capSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
              {capResult && (
                <div className="text-xs mt-1" style={{ color: capResult.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {capResult.ok ? '✓ ' : '✗ '}{capResult.message}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NetworkSharing() {
  const [enabled, setEnabled] = useState(false)
  const [headless, setHeadless] = useState(false)
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    api.get('/settings/app-config').then(cfg => {
      setEnabled(!!cfg.network_sharing)
      setHeadless(!!cfg.headless)
    }).catch(() => {})
  }, [])

  const handleToggle = async () => {
    setSaving(true)
    setResult(null)
    try {
      if (!enabled) {
        // Enabling — need PIN
        if (pin.length < 6) {
          setResult({ ok: false, message: 'PIN must be at least 6 characters' })
          setSaving(false)
          return
        }
        const res = await api.post('/settings/network-sharing', { enabled: true, pin })
        setEnabled(true)
        setResult({ ok: true, message: `Enabled! Devices can connect at http://${res.local_ip}:${res.port} — they'll need the PIN.` })
        setPin('')
      } else {
        // Disabling
        await api.post('/settings/network-sharing', { enabled: false })
        setEnabled(false)
        setResult({ ok: true, message: 'Network sharing disabled. Other devices can no longer access.' })
      }
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="theme-card p-5 mb-6">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>Network Sharing</h3>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        By default, OpenArgentum is only accessible on this computer. Enable network sharing to allow other devices on your home network (e.g., family members' phones or tablets) to access it.
      </p>

      {enabled ? (
        <div>
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-accent-light)' }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-accent-text)' }}>Network sharing is enabled</span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            Other devices can access this app by visiting the address shown when the server starts. They'll need to enter the PIN you set.
          </p>
          {headless ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Network sharing was enabled via <code className="text-xs px-1 rounded" style={{ backgroundColor: 'var(--color-surface-alt)' }}>--headless</code> flag. To disable, restart without the flag.
            </p>
          ) : (
            <button onClick={handleToggle} disabled={saving} className="theme-btn-secondary px-3 py-1.5 text-xs">
              {saving ? 'Disabling...' : 'Disable Network Sharing'}
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-text-muted)' }} />
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Localhost only — other devices cannot access</span>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Set a PIN (min 6 characters)</label>
              <input type="password" className="theme-input w-full px-3 py-1.5 text-sm" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter PIN..." />
            </div>
            <button onClick={handleToggle} disabled={saving || pin.length < 6} className="theme-btn-primary px-3 py-1.5 text-sm disabled:opacity-50">
              {saving ? 'Enabling...' : 'Enable'}
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Family members will enter this PIN when accessing the app from their devices. Data is transmitted over your local network (not encrypted) — only use on trusted networks.
          </p>
        </div>
      )}

      {result && (
        <div className="mt-3 text-xs" style={{ color: result.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {result.message}
        </div>
      )}
    </div>
  )
}

function DatabaseManagement({ stats, refetchStats }) {
  const queryClient = useQueryClient()
  const { data: dbData, refetch: refetchDatabases } = useQuery({
    queryKey: ['databases'],
    queryFn: () => api.get('/settings/databases'),
  })
  const { data: snapshotData, refetch: refetchSnapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => api.get('/settings/snapshots'),
  })

  const [showNewDb, setShowNewDb] = useState(false)
  const [newDbName, setNewDbName] = useState('')
  const [showNewSnapshot, setShowNewSnapshot] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [busy, setBusy] = useState(null) // tracks which action is in progress
  const [result, setResult] = useState(null)

  const invalidateAll = () => { queryClient.invalidateQueries(); refetchStats(); refetchDatabases(); refetchSnapshots() }

  const handleSwitch = async (name) => {
    if (!confirm(`Switch to "${name}"?${name === 'demo.db' ? ' Changes to the demo database are reset when the server restarts.' : ''}`)) return
    setBusy('switch')
    setResult(null)
    try {
      await api.post('/settings/switch-database', { name })
      // Reload the page to reset all state (chat panel, caches, etc.)
      window.location.reload()
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setBusy(null)
    }
  }

  const handleCreateDb = async () => {
    if (!newDbName.trim()) return
    setBusy('create-db')
    try {
      await api.post('/settings/databases', { name: newDbName.trim() })
      setNewDbName('')
      setShowNewDb(false)
      refetchDatabases()
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setBusy(null)
    }
  }

  const handleCreateSnapshot = async () => {
    if (!snapshotName.trim()) return
    setBusy('create-snap')
    try {
      await api.post('/settings/snapshots', { name: snapshotName.trim() })
      setSnapshotName('')
      setShowNewSnapshot(false)
      refetchSnapshots()
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setBusy(null)
    }
  }

  const handleRestore = async (snap) => {
    if (!confirm(`Restore snapshot "${snap.name}"? An auto-backup of the current database will be created first.`)) return
    setBusy(`restore-${snap.id}`)
    try {
      await api.post(`/settings/snapshots/${snap.id}/restore`)
      invalidateAll()
      setResult({ ok: true, message: `Restored "${snap.name}"` })
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteSnapshot = async (snap) => {
    if (!confirm(`Delete snapshot "${snap.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/settings/snapshots/${snap.id}`)
      refetchSnapshots()
    } catch (e) {
      setResult({ ok: false, message: e.message })
    }
  }

  const databases = dbData?.databases || []
  const snapshots = (snapshotData?.snapshots || []).filter(s => s.exists)
  const userSnapshots = snapshots.filter(s => !s.name.startsWith('auto_'))
  const autoSnapshots = snapshots.filter(s => s.name.startsWith('auto_'))

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatRelativeTime = (isoStr) => {
    const diff = Date.now() - new Date(isoStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div className="theme-card p-5 mb-6">
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>Database</h3>

      {result && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg" style={{
          color: result.ok ? 'var(--color-success)' : 'var(--color-danger)',
          backgroundColor: result.ok ? 'var(--color-badge-auto-bg)' : 'var(--color-warning-bg)',
        }}>
          {result.ok ? '✓ ' : '✗ '}{result.message}
        </div>
      )}

      {/* Database Switcher */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Available Databases</span>
          <button onClick={() => setShowNewDb(!showNewDb)} className="theme-btn-secondary px-2 py-0.5 text-xs">
            {showNewDb ? 'Cancel' : '+ New'}
          </button>
        </div>
        {showNewDb && (
          <div className="flex gap-2 mb-2">
            <input className="theme-input flex-1 px-2 py-1.5 text-sm" value={newDbName} onChange={e => setNewDbName(e.target.value)} placeholder="Database name..." onKeyDown={e => e.key === 'Enter' && handleCreateDb()} />
            <button onClick={handleCreateDb} disabled={!newDbName.trim() || busy === 'create-db'} className="theme-btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
              {busy === 'create-db' ? 'Creating...' : 'Create'}
            </button>
          </div>
        )}
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border-light)' }}>
          {databases.map((db, i) => (
            <div key={db.name} className="flex items-center px-3 py-2.5 gap-3" style={{ borderBottom: i < databases.length - 1 ? '1px solid var(--color-border-light)' : 'none' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{db.name}</span>
                  {db.is_active && (
                    <span className="theme-badge text-[10px] px-1.5 py-0.5" style={{ backgroundColor: 'var(--color-badge-auto-bg)', color: 'var(--color-success)' }}>Active</span>
                  )}
                  {db.is_demo && (
                    <span className="theme-badge text-[10px] px-1.5 py-0.5" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-text)' }}>Demo</span>
                  )}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {formatSize(db.size_bytes)}
                  {db.is_demo && db.is_active && ' · Resets on restart'}
                </div>
              </div>
              {!db.is_active && (
                <button onClick={() => handleSwitch(db.name)} disabled={busy === 'switch'} className="theme-btn-primary px-3 py-1 text-xs disabled:opacity-50">
                  {busy === 'switch' ? '...' : 'Switch'}
                </button>
              )}
            </div>
          ))}
          {databases.length === 0 && (
            <div className="px-3 py-4 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-5">
          <span className="text-xs font-medium block mb-2" style={{ color: 'var(--color-text-muted)' }}>Stats</span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 text-sm">
            {[
              ['Transactions', stats.transactions],
              ['Statements', stats.statements],
              ['Categories', stats.categories],
              ['Tags', stats.tags],
              ['Tiers', stats.spend_tiers],
              ['Accounts', stats.accounts],
              ['Projects', stats.projects],
              ['Chat Sessions', stats.chat_sessions],
              ['Mutations', stats.mutations_executed],
              ['Reverted', stats.mutations_reverted],
              ['DB Size', `${stats.db_size_mb} MB`],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                <span className="block text-lg font-medium" style={{ color: 'var(--color-text)' }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Snapshots */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Snapshots</span>
          <button onClick={() => setShowNewSnapshot(!showNewSnapshot)} className="theme-btn-secondary px-2 py-0.5 text-xs">
            {showNewSnapshot ? 'Cancel' : '+ Snapshot'}
          </button>
        </div>
        {showNewSnapshot && (
          <div className="flex gap-2 mb-2">
            <input className="theme-input flex-1 px-2 py-1.5 text-sm" value={snapshotName} onChange={e => setSnapshotName(e.target.value)} placeholder="Snapshot name..." onKeyDown={e => e.key === 'Enter' && handleCreateSnapshot()} />
            <button onClick={handleCreateSnapshot} disabled={!snapshotName.trim() || busy === 'create-snap'} className="theme-btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
              {busy === 'create-snap' ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}

        {userSnapshots.length === 0 && autoSnapshots.length === 0 ? (
          <div className="text-xs py-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
            No snapshots yet. Create one to save a point-in-time copy of your database.
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border-light)' }}>
            {userSnapshots.map((snap, i) => (
              <div key={snap.id} className="flex items-center px-3 py-2.5 gap-3" style={{ borderBottom: (i < userSnapshots.length - 1 || autoSnapshots.length > 0) ? '1px solid var(--color-border-light)' : 'none' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{snap.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {formatRelativeTime(snap.timestamp)} · {formatSize(snap.size_bytes)} · from {snap.source_db}
                  </div>
                </div>
                <button onClick={() => handleRestore(snap)} disabled={busy?.startsWith('restore')} className="text-xs font-medium" style={{ color: 'var(--color-accent-text)' }}>
                  {busy === `restore-${snap.id}` ? '...' : 'Restore'}
                </button>
                <button onClick={() => handleDeleteSnapshot(snap)} className="text-xs font-medium" style={{ color: 'var(--color-danger)' }}>Delete</button>
              </div>
            ))}
            {autoSnapshots.length > 0 && (
              <AutoSnapshotSection snapshots={autoSnapshots} formatSize={formatSize} formatRelativeTime={formatRelativeTime} busy={busy} onRestore={handleRestore} onDelete={handleDeleteSnapshot} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AutoSnapshotSection({ snapshots, formatSize, formatRelativeTime, busy, onRestore, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-3 py-2 text-xs" style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-alt)' }}>
        <span>{snapshots.length} auto-backup{snapshots.length !== 1 ? 's' : ''}</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && snapshots.map((snap, i) => (
        <div key={snap.id} className="flex items-center px-3 py-2 gap-3" style={{ borderBottom: i < snapshots.length - 1 ? '1px solid var(--color-border-light)' : 'none', backgroundColor: 'var(--color-surface-alt)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{snap.name}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {formatRelativeTime(snap.timestamp)} · {formatSize(snap.size_bytes)}
            </div>
          </div>
          <button onClick={() => onRestore(snap)} disabled={busy?.startsWith('restore')} className="text-xs" style={{ color: 'var(--color-accent-text)' }}>Restore</button>
          <button onClick={() => onDelete(snap)} className="text-xs" style={{ color: 'var(--color-danger)' }}>Delete</button>
        </div>
      ))}
    </>
  )
}

export default function Settings() {
  const queryClient = useQueryClient()
  const { theme, setTheme, themes } = useTheme()
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['settings-stats'],
    queryFn: () => api.get('/settings/stats'),
  })
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') })

  const updateAccount = useMutation({
    mutationFn: ({ id, data }) => api.put(`/accounts/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  })
  const mergeAccount = useMutation({
    mutationFn: ({ sourceId, targetId }) => api.post(`/accounts/${sourceId}/merge/${targetId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); queryClient.invalidateQueries({ queryKey: ['statements'] }) },
  })
  const deleteAccount = useMutation({
    mutationFn: (id) => api.delete(`/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  })
  const createAccount = useMutation({
    mutationFn: (data) => api.post('/accounts', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const invalidateAll = () => { queryClient.invalidateQueries(); refetchStats() }

  const [showAddAccount, setShowAddAccount] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', institution: '', account_type: 'checking', account_number: '', account_holder: '' })

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text)' }}>Settings</h2>

      {/* Theme Picker */}
      <div className="theme-card p-5 mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>Theme</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-3">
          {themes.map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="p-3 rounded-xl border-2 transition-all text-left"
              style={{
                borderColor: theme === t.id ? t.preview[1] : 'var(--color-border-light)',
                backgroundColor: theme === t.id ? 'var(--color-accent-light)' : 'var(--color-surface)',
              }}
            >
              <div className="flex gap-1.5 mb-2">
                {t.preview.map((color, i) => (
                  <div key={i} className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                ))}
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.label}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Accounts Management */}
      <div className="theme-card mb-6 overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Accounts</h3>
          <button onClick={() => setShowAddAccount(!showAddAccount)} className="theme-btn-secondary px-3 py-1 text-xs">
            {showAddAccount ? 'Cancel' : '+ Add Account'}
          </button>
        </div>

        {showAddAccount && (
          <div className="px-5 pb-3">
            <div className="grid grid-cols-2 gap-3 mb-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-accent-light)' }}>
              <input className="theme-input px-2 py-1.5 text-sm" value={newAccount.name} onChange={e => setNewAccount({...newAccount, name: e.target.value})} placeholder="Display name" />
              <input className="theme-input px-2 py-1.5 text-sm" value={newAccount.institution} onChange={e => setNewAccount({...newAccount, institution: e.target.value})} placeholder="Institution (e.g. Scotiabank)" />
              <select className="theme-input px-2 py-1.5 text-sm" value={newAccount.account_type} onChange={e => setNewAccount({...newAccount, account_type: e.target.value})}>
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit Card</option>
                <option value="line_of_credit">Line of Credit</option>
                <option value="investment">Investment</option>
              </select>
              <input className="theme-input px-2 py-1.5 text-sm" value={newAccount.account_number} onChange={e => setNewAccount({...newAccount, account_number: e.target.value})} placeholder="Account # (optional)" />
              <div className="col-span-2 flex gap-2">
                <button onClick={() => {
                  if (!newAccount.name.trim()) return
                  createAccount.mutate(newAccount)
                  setNewAccount({ name: '', institution: '', account_type: 'checking', account_number: '', account_holder: '' })
                  setShowAddAccount(false)
                }} className="theme-btn-primary px-3 py-1.5 text-xs">Add Account</button>
              </div>
            </div>
          </div>
        )}

        {accounts.length === 0 ? (
          <p className="px-5 pb-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>No accounts yet. They'll be auto-created when you import statements.</p>
        ) : (
          accounts.map(account => (
            <AccountRow
              key={account.id}
              account={account}
              accounts={accounts}
              onUpdate={(id, data) => updateAccount.mutate({ id, data })}
              onMerge={(sourceId, targetId) => mergeAccount.mutate({ sourceId, targetId })}
              onDelete={(id) => deleteAccount.mutate(id)}
            />
          ))
        )}
      </div>

      {/* Database Management */}
      <DatabaseManagement stats={stats} refetchStats={refetchStats} />

      {/* Categorization Actions */}
      <div className="theme-card p-5 mb-6">
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>Categorization</h3>
        <ActionButton label="Clear Categories" description="Delete all categories and reset transaction categorization to pending." confirmText="This will delete all categories and reset all transaction categorizations. Continue?" variant="warning" onAction={async () => { const r = await api.post('/settings/clear-categories'); invalidateAll(); return r }} />
        <ActionButton label="Reset Auto-Categories" description="Reset auto-categorized transactions to pending (preserves manual overrides)." confirmText="Reset all auto-categorized transactions?" variant="default" onAction={async () => { const r = await api.post('/settings/recategorize-all'); invalidateAll(); return r }} />
      </div>

      {/* LLM Configuration */}
      <LLMConfig />

      {/* Network Sharing */}
      <NetworkSharing />

      {/* Danger Zone */}
      <div className="theme-card p-5 mb-6" style={{ borderColor: 'var(--color-danger)', borderWidth: '1px' }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-danger)' }}>Danger Zone</h3>
        <ActionButton label="Reset Database" description={`Wipe all data in the active database (${stats?.active_db || 'finance.db'}). An automatic backup snapshot is created first. Uploaded statement files are preserved on disk for re-import.`} confirmText={`This will DELETE all transactions, categories, tags, projects, and chat history in "${stats?.active_db || 'finance.db'}". An automatic backup will be created. Uploaded files will be preserved.\n\nAre you sure?`} variant="danger" onAction={async () => { const r = await api.post('/settings/reset-database'); invalidateAll(); return r }} />
        <ActionButton label="Purge Everything" description={`Reset the active database (${stats?.active_db || 'finance.db'}) AND delete all uploaded statement files from disk. Complete fresh start.`} confirmText={`This will PERMANENTLY DELETE all data in "${stats?.active_db || 'finance.db'}" AND all uploaded statement files. An automatic backup will be created, but the files will be gone.\n\nThis cannot be undone. Are you sure?`} variant="danger" onAction={async () => { const r = await api.post('/settings/purge-all'); invalidateAll(); return r }} />
      </div>

      {/* About */}
      <div className="theme-card p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>About</h3>
        <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <p className="mb-2">
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>OpenArgentum</span>
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>v{__APP_VERSION__}</span>
          </p>
          <p className="mb-2">
            Built by <a href="https://github.com/amithmathew" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-primary)' }}>Amith Mathew</a>
          </p>
          <p className="mb-3">
            AI features powered by <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-primary)' }}>Google Gemini</a>
            {' · '}
            <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-primary)' }}>How Google uses your data</a>
          </p>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            OpenArgentum
            {' · '}
            <a href="https://github.com/amithmathew/OpenArgentum/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-text-muted)' }}>AGPL-3.0</a>
            {' · '}
            <a href="https://github.com/amithmathew/OpenArgentum" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-text-muted)' }}>Source</a>
          </div>
        </div>
      </div>
    </div>
  )
}
