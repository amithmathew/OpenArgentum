import { useState } from 'react'
import { api } from '../api'

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState('api_key')
  const [apiKey, setApiKey] = useState('')
  const [gcpProject, setGcpProject] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)

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

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="text-center">
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
    </div>,

    // Step 1: LLM Setup
    <div key="llm">
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>Set up AI</h2>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        Aurelia and statement import use the Google Gemini API. Connect it with a Gemini API key or your Google Cloud credentials. Everything else — the dashboard, and viewing or editing transactions manually — works without one, and you can add it later in Settings.
      </p>

      <div className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-text-secondary)' }}>
        <p className="mb-1 font-semibold" style={{ color: 'var(--color-text)' }}>How Google handles your data</p>
        <p className="mb-1.5">
          Your statements are sent to Google Gemini. We recommend Google's <strong>paid</strong> data terms — enable{' '}
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)' }}>Cloud Billing</a>{' '}
          on your API key's project, or use GCP credentials below. Under the paid terms, Google <strong>doesn't use your prompts or responses to train its models</strong> or have them reviewed by humans. Billing status — not spend — is what applies these terms, so you can stay within the free quota.
        </p>
        <p className="mb-1.5">
          A free key with no billing uses the <strong>unpaid</strong> tier, where Google uses your content to improve its products and human reviewers may read it. Google's terms state: <em>“Do not submit sensitive, confidential, or personal information to the Unpaid Services.”</em> Bank statements are exactly that, so we don't recommend the free tier for real financial data (it's fine for the demo).
        </p>
        <p style={{ color: 'var(--color-text-muted)' }}>
          These terms are Google's and can change at any time — you're responsible for reviewing the current{' '}
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
            Get a free API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-text)' }}>Google AI Studio</a>
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
            Using Application Default Credentials — Vertex AI on GCP, which uses Google's paid/enterprise data terms. Make sure you've run <code className="text-xs px-1 rounded" style={{ backgroundColor: 'var(--color-surface-alt)' }}>gcloud auth application-default login</code>
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
    </div>,

    // Step 2: Done
    <div key="done" className="text-center">
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
    </div>,
  ]

  const canProceed = step === 0 || (step === 1 && testResult?.ok) || step === 2
  const isLast = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md mx-4 rounded-2xl p-6" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
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
          {steps[step]}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4" style={{ borderTop: '1px solid var(--color-border-light)' }}>
          <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
            className="theme-btn-secondary px-4 py-2 text-sm disabled:opacity-30">
            Back
          </button>
          {isLast ? (
            <button onClick={handleFinish} disabled={saving}
              className="theme-btn-primary px-6 py-2 text-sm">
              {saving ? 'Starting...' : 'Get Started'}
            </button>
          ) : (
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed}
              className="theme-btn-primary px-4 py-2 text-sm disabled:opacity-30">
              {step === 1 && !testResult?.ok ? 'Configure above first' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
