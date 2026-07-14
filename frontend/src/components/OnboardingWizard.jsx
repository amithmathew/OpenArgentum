import { useState, useEffect } from 'react'
import { api } from '../api'

// mode='fresh' is first-run onboarding (unescapable). mode='transition' re-opens
// the wizard from the demo banner: skips the welcome step, lets an already-configured
// LLM pass through, adds a choose-your-database step, and can be closed.
export default function OnboardingWizard({ mode = 'fresh', llmConfigured = false, onClose, onComplete }) {
  const transition = mode === 'transition'
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState('api_key')
  const [apiKey, setApiKey] = useState('')
  const [gcpProject, setGcpProject] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  // Transition mode: database choice
  const [databases, setDatabases] = useState(null)
  const [dbChoice, setDbChoice] = useState(null) // a db name, or '__new__'
  const [newDbName, setNewDbName] = useState('')
  const [finishError, setFinishError] = useState(null)

  useEffect(() => {
    if (!transition) return
    api.get('/settings/databases').then(res => {
      const real = res.databases.filter(db => !db.is_demo)
      setDatabases(real)
      setDbChoice(real.length > 0 ? real[0].name : '__new__')
    }).catch(() => {
      setDatabases([])
      setDbChoice('__new__')
    })
  }, [transition])

  const handleTestLLM = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const body = provider === 'api_key'
        ? { provider: 'api_key', api_key: apiKey }
        : { provider: 'adc', gcp_project: gcpProject || null }
      const result = await api.post('/settings/setup-llm', body)
      setTestResult({ ok: true, message: result.message })
    } catch (e) {
      setTestResult({ ok: false, message: e.message })
    } finally {
      setTesting(false)
    }
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      await api.post('/settings/complete-onboarding')
      onComplete()
    } finally {
      setSaving(false)
    }
  }

  const handleExploreDemo = async () => {
    setLoadingDemo(true)
    try {
      // Switch to the pre-loaded sample database and skip the key requirement.
      await api.post('/settings/switch-database', { name: 'demo.db' })
      await api.post('/settings/complete-onboarding')
      onComplete()
    } catch (e) {
      setTestResult({ ok: false, message: e.message })
      setLoadingDemo(false)
    }
  }

  const handleFinishTransition = async () => {
    // Onboarding is already complete in transition mode — just create/switch the DB.
    setSaving(true)
    setFinishError(null)
    try {
      let target = dbChoice
      if (dbChoice === '__new__') {
        const created = await api.post('/settings/databases', { name: newDbName.trim() })
        target = created.name
      }
      await api.post('/settings/switch-database', { name: target })
      onComplete()
    } catch (e) {
      setFinishError(e.message)
      setSaving(false)
    }
  }

  // Fresh onboarding: Welcome
  const welcomeStep = { key: 'welcome', content: (
    <div className="text-center">
      <div className="text-4xl mb-4">✨</div>
      <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>Welcome to OpenArgentum</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Your personal finance tracker powered by AI.
      </p>
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <strong>Aurelia</strong>, your AI assistant, will help you analyze spending, categorize transactions, and make sense of your finances.
      </p>
      <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>
        All your data stays on your device. Nothing is sent to the cloud except LLM queries.
      </p>
      <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--color-border-light)' }}>
        <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
          Just want to look around first?
        </p>
        <button onClick={handleExploreDemo} disabled={loadingDemo}
          className="theme-btn-secondary w-full py-2 text-sm disabled:opacity-50">
          {loadingDemo ? 'Loading demo…' : 'Explore with sample data'}
        </button>
        <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Loads a demo database of realistic transactions — no API key needed. Switch to your own data anytime in Settings.
        </p>
      </div>
    </div>
  ) }

  // LLM Setup (both modes)
  const llmStep = { key: 'llm', content: (
    <div>
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>Set up AI</h2>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        Aurelia and statement import use the Google Gemini API. Connect it with a Gemini API key or your Google Cloud credentials. Everything else — the dashboard, and viewing or editing transactions manually — works without one, and you can add it later in Settings.
      </p>

      {transition && llmConfigured && (
        <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-text)' }}>
          ✓ AI is already configured — you can skip ahead, or update it below.
        </div>
      )}

      <div className="text-xs mb-4 px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-text-secondary)' }}>
        <p className="mb-2">
          <strong style={{ color: 'var(--color-text)' }}>OpenArgentum sends the statements you import to Google Gemini</strong> to read and categorize them. We recommend <strong>Google's paid terms</strong> for real financial data:
        </p>
        <ul className="space-y-1.5 mb-2 list-none">
          <li>
            <strong style={{ color: 'var(--color-text)' }}>✓ Real statements:</strong> enable{' '}
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)' }}>Cloud Billing</a>{' '}
            (or use GCP credentials below). Google's paid terms provide data protection provisions for personal and private information.
          </li>
          <li>
            <strong style={{ color: 'var(--color-text)' }}>⚠ Free tier:</strong> great for the demo and trying things out. We recommend switching to the paid tier for your actual financial data.
          </li>
        </ul>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Google's terms can change at any time — always check the current{' '}
          <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)' }}>Gemini API terms</a>.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setProvider('api_key')}
          className="flex-1 py-2 text-xs font-medium rounded-lg transition-all"
          style={{
            backgroundColor: provider === 'api_key' ? 'var(--color-accent-light)' : 'var(--color-surface-alt)',
            color: provider === 'api_key' ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
            border: `1px solid ${provider === 'api_key' ? 'var(--color-accent)' : 'var(--color-border-light)'}`,
          }}>
          API Key (simple)
        </button>
        <button onClick={() => setProvider('adc')}
          className="flex-1 py-2 text-xs font-medium rounded-lg transition-all"
          style={{
            backgroundColor: provider === 'adc' ? 'var(--color-accent-light)' : 'var(--color-surface-alt)',
            color: provider === 'adc' ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
            border: `1px solid ${provider === 'adc' ? 'var(--color-accent)' : 'var(--color-border-light)'}`,
          }}>
          GCP ADC (advanced)
        </button>
      </div>

      {provider === 'api_key' ? (
        <div>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Get an API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)' }}>Google AI Studio</a> — even without billing it's perfect for trying the demo and AI features. For real statements, we recommend enabling billing (see above).
          </p>
          <input
            className="theme-input w-full px-3 py-2 text-sm mb-3"
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Paste your Gemini API key..."
          />
        </div>
      ) : (
        <div>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Using Application Default Credentials — Vertex AI on GCP. Make sure you've run <code className="text-xs px-1 rounded" style={{ backgroundColor: 'var(--color-surface-alt)' }}>gcloud auth application-default login</code>
          </p>
          <input
            className="theme-input w-full px-3 py-2 text-sm mb-3"
            value={gcpProject}
            onChange={e => setGcpProject(e.target.value)}
            placeholder="GCP Project ID (optional if set in gcloud)"
          />
        </div>
      )}

      <button onClick={handleTestLLM} disabled={testing || (provider === 'api_key' && !apiKey.trim())}
        className="theme-btn-primary w-full py-2 text-sm disabled:opacity-50">
        {testing ? 'Testing...' : 'Test & Save'}
      </button>

      {testResult && (
        <div className="mt-3 text-xs px-3 py-2 rounded-lg" style={{
          backgroundColor: testResult.ok ? 'var(--color-accent-light)' : 'var(--color-warning-bg)',
          color: testResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
        }}>
          {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
        </div>
      )}
    </div>
  ) }

  // Fresh onboarding: Done
  const doneStep = { key: 'done', content: (
    <div className="text-center">
      <div className="text-4xl mb-4">🎉</div>
      <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text)' }}>You're all set!</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Start by importing your bank statements. Aurelia will extract, categorize, and help you analyze your finances.
      </p>
      <div className="text-xs space-y-2" style={{ color: 'var(--color-text-muted)' }}>
        <p><strong>1.</strong> Go to <strong>Import</strong> and upload your PDF or CSV statements</p>
        <p><strong>2.</strong> Click <strong>Ingest</strong> to extract transactions</p>
        <p><strong>3.</strong> Check the <strong>Dashboard</strong> for insights, or ask <strong>Aurelia</strong> anything</p>
      </div>
    </div>
  ) }

  // Transition mode: pick (or create) the database that replaces the demo
  const dbOptionStyle = (selected) => ({
    border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border-light)'}`,
    backgroundColor: selected ? 'var(--color-accent-light)' : 'var(--color-surface-alt)',
    color: 'var(--color-text)',
  })
  const chooseDbStep = { key: 'choosedb', content: (
    <div>
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>Choose your database</h2>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        Your data lives in a local database file, separate from the demo. Pick one to use, or create a fresh one — the sample data stays in demo.db if you ever want it back.
      </p>
      {databases === null ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading databases…</p>
      ) : (
        <div className="space-y-2">
          {databases.map(db => (
            <label key={db.name} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-all" style={dbOptionStyle(dbChoice === db.name)}>
              <input type="radio" name="db-choice" checked={dbChoice === db.name} onChange={() => setDbChoice(db.name)} />
              <span className="font-medium">{db.name}</span>
            </label>
          ))}
          <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-all" style={dbOptionStyle(dbChoice === '__new__')}>
            <input type="radio" name="db-choice" checked={dbChoice === '__new__'} onChange={() => setDbChoice('__new__')} />
            <span className="font-medium">Create a new database</span>
          </label>
          {dbChoice === '__new__' && (
            <input
              className="theme-input w-full px-3 py-2 text-sm"
              value={newDbName}
              onChange={e => setNewDbName(e.target.value)}
              placeholder="e.g. finance"
            />
          )}
        </div>
      )}
    </div>
  ) }

  // Transition mode: Done
  const newName = newDbName.trim()
  const targetDbLabel = dbChoice === '__new__'
    ? (newName ? (newName.endsWith('.db') ? newName : `${newName}.db`) : 'your new database')
    : dbChoice
  const doneTransitionStep = { key: 'done-transition', content: (
    <div className="text-center">
      <div className="text-4xl mb-4">🎉</div>
      <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text)' }}>Ready to switch</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Finishing switches you from the demo to <strong>{targetDbLabel}</strong>. Then:
      </p>
      <div className="text-xs space-y-2" style={{ color: 'var(--color-text-muted)' }}>
        <p><strong>1.</strong> Go to <strong>Import</strong> and upload your PDF or CSV statements</p>
        <p><strong>2.</strong> Click <strong>Ingest</strong> to extract transactions</p>
        <p><strong>3.</strong> Check the <strong>Dashboard</strong> for insights, or ask <strong>Aurelia</strong> anything</p>
      </div>
      {finishError && (
        <div className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-danger)' }}>
          ✗ {finishError}
        </div>
      )}
    </div>
  ) }

  const steps = transition
    ? [llmStep, chooseDbStep, doneTransitionStep]
    : [welcomeStep, llmStep, doneStep]

  const stepKey = steps[step].key
  const canProceed =
    stepKey === 'llm' ? (testResult?.ok || (transition && llmConfigured))
    : stepKey === 'choosedb' ? (dbChoice === '__new__' ? newName.length > 0 : !!dbChoice)
    : true
  const isLast = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="relative w-full max-w-md mx-4 rounded-2xl p-6" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {/* Close — transition mode only; fresh onboarding stays unescapable */}
        {transition && (
          <button onClick={onClose} title="Close"
            className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ color: 'var(--color-text-muted)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full transition-all" style={{
              backgroundColor: i === step ? 'var(--color-accent)' : 'var(--color-border)',
              transform: i === step ? 'scale(1.3)' : undefined,
            }} />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[250px] max-h-[70vh] overflow-y-auto flex flex-col justify-center">
          {steps[step].content}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4" style={{ borderTop: '1px solid var(--color-border-light)' }}>
          {transition && step === 0 ? (
            <button onClick={onClose}
              className="theme-btn-secondary px-4 py-2 text-sm">
              Cancel
            </button>
          ) : (
            <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
              className="theme-btn-secondary px-4 py-2 text-sm disabled:opacity-30">
              Back
            </button>
          )}
          {isLast ? (
            <button onClick={transition ? handleFinishTransition : handleFinish} disabled={saving}
              className="theme-btn-primary px-6 py-2 text-sm">
              {transition
                ? (saving ? 'Switching…' : 'Switch & finish')
                : (saving ? 'Starting...' : 'Get Started')}
            </button>
          ) : (
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed}
              className="theme-btn-primary px-4 py-2 text-sm disabled:opacity-30">
              {stepKey === 'llm' && !canProceed ? 'Configure above first' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
