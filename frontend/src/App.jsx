import { useState, useEffect, useMemo, Component } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ChatPanel from './components/ChatPanel'
import OnboardingWizard from './components/OnboardingWizard'
import { api } from './api'
import AppLogo from './components/AppLogo'
import AureliaIcon from './components/AureliaIcon'
import useIsMobile from './hooks/useIsMobile'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Categories from './pages/Categories'
import Projects from './pages/Projects'
import Import from './pages/Import'
import Settings from './pages/Settings'

const navGroups = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { action: 'chat', label: 'Ask Aurelia' },
      { to: '/transactions', label: 'Transactions', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { to: '/projects', label: 'Projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    ],
  },
  {
    items: [
      { to: '/categories', label: 'Classify', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
      { to: '/import', label: 'Import', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
    ],
  },
  {
    items: [
      { to: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    ],
  },
]

function NavIcon({ path }) {
  return (
    <svg className="w-4.5 h-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

const mobileNavPrimary = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { action: 'chat', label: 'Aurelia' },
  { to: '/transactions', label: 'Transactions', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { to: '/projects', label: 'Projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
]

const mobileNavMore = [
  { to: '/categories', label: 'Classify', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
  { to: '/import', label: 'Import', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
  { to: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

function SidebarFooter({ collapsed }) {
  const { data: stats } = useQuery({
    queryKey: ['settings-stats'],
    queryFn: () => api.get('/settings/stats'),
    staleTime: 60000,
  })

  const facts = useMemo(() => {
    if (!stats) return []
    const f = []
    if (stats.transactions) f.push(`Tracking ${stats.transactions.toLocaleString()} transactions`)
    if (stats.categories) f.push(`Organized into ${stats.categories} categories`)
    if (stats.tags) f.push(`${stats.tags} tags in use`)
    if (stats.accounts) f.push(`${stats.accounts} account${stats.accounts !== 1 ? 's' : ''} connected`)
    if (stats.projects) f.push(`${stats.projects} project${stats.projects !== 1 ? 's' : ''} created`)
    if (stats.statements) f.push(`${stats.statements} statement${stats.statements !== 1 ? 's' : ''} imported`)
    return f
  }, [stats])

  const [factIndex, setFactIndex] = useState(0)
  useEffect(() => {
    if (facts.length <= 1) return
    const t = setInterval(() => setFactIndex(i => (i + 1) % facts.length), 4000)
    return () => clearInterval(t)
  }, [facts.length])

  if (collapsed) {
    return (
      <div className="px-2 py-3 text-center" style={{ borderTop: '1px solid var(--color-border-light)' }}>
        <div className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>v{__APP_VERSION__}</div>
      </div>
    )
  }

  return (
    <div className="px-3 py-3 text-center" style={{ borderTop: '1px solid var(--color-border-light)' }}>
      {facts.length > 0 && (
        <div className="text-[11px] mb-1.5 transition-opacity duration-500" style={{ color: 'var(--color-text-secondary)' }}>
          {facts[factIndex % facts.length]}
        </div>
      )}
      <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        OpenArgentum v{__APP_VERSION__} 🍁
      </div>
    </div>
  )
}

function MobileBottomNav({ onChatOpen, onCloseChat, chatActive }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  // Close "more" menu on navigation
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const handleNavClick = () => { setMoreOpen(false); onCloseChat() }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] md:hidden" style={{ backgroundColor: 'var(--color-nav-bg)', borderTop: '1px solid var(--color-border-light)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* More menu popup */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-full left-0 right-0 z-30 px-4 pb-2">
            <div className="rounded-xl shadow-lg overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-light)' }}>
              {mobileNavMore.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className="flex items-center gap-3 px-4 py-3 transition-colors"
                  style={({ isActive }) => ({
                    backgroundColor: isActive ? 'var(--color-accent-light)' : 'transparent',
                    color: isActive ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                  })}
                  onClick={handleNavClick}
                >
                  <NavIcon path={item.icon} />
                  <span className="text-sm font-medium">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Tab bar */}
      <div className="flex items-center justify-around px-2 pt-1.5 pb-1">
        {mobileNavPrimary.map(item => {
          if (item.action === 'chat') {
            return (
              <button key="chat" onClick={() => chatActive ? onCloseChat() : onChatOpen()} className="flex flex-col items-center gap-0.5 px-2 py-1 min-w-[56px]"
                style={{ color: chatActive ? 'var(--color-accent-text)' : 'var(--color-text-muted)' }}>
                <AureliaIcon size={22} mono className="shrink-0" />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </button>
            )
          }
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              onClick={handleNavClick}
              className="flex flex-col items-center gap-0.5 px-2 py-1 min-w-[56px]"
              style={({ isActive }) => ({ color: isActive && !chatActive ? 'var(--color-accent-text)' : 'var(--color-text-muted)' })}>
              <NavIcon path={item.icon} />
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            </NavLink>
          )
        })}
        <button onClick={() => setMoreOpen(!moreOpen)}
          className="flex flex-col items-center gap-0.5 px-2 py-1 min-w-[56px]"
          style={{ color: moreOpen ? 'var(--color-accent-text)' : 'var(--color-text-muted)' }}>
          <svg className="w-4.5 h-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
          <span className="text-[10px] font-medium leading-tight">More</span>
        </button>
      </div>
    </div>
  )
}

class ChatErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, showDetails: false }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('ChatPanel crashed:', error, info)
  }
  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || this.state.error?.toString() || 'Unknown error'
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 md:relative md:inset-auto md:shrink-0" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="text-center max-w-sm">
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--color-text)' }}>Chat encountered an error</p>
            <div className="flex justify-center gap-2 mb-3">
              <button onClick={() => this.setState({ hasError: false, error: null, showDetails: false })} className="theme-btn-primary px-4 py-2 text-sm">Retry</button>
              <button onClick={() => { this.setState({ hasError: false, error: null, showDetails: false }); this.props.onClose?.() }} className="theme-btn-secondary px-4 py-2 text-sm">Close</button>
            </div>
            <button onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
              className="text-xs flex items-center gap-1 mx-auto" style={{ color: 'var(--color-text-muted)' }}>
              <svg className={`w-3 h-3 transition-transform ${this.state.showDetails ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Error details
            </button>
            {this.state.showDetails && (
              <div className="mt-2 p-2 rounded text-xs text-left break-all" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-danger)' }}>
                {errorMsg}
              </div>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function PinLogin({ onSuccess }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/login', { pin })
      onSuccess()
    } catch (err) {
      setError('Invalid PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="theme-card p-8 w-80 text-center">
        <div className="flex justify-center mb-3"><AppLogo size={48} /></div>
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>OpenArgentum</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--color-text-muted)' }}>Enter PIN to access</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            className="theme-input w-full px-4 py-2 text-center text-lg tracking-widest mb-3"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="PIN"
            autoFocus
          />
          {error && <p className="text-xs mb-2" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <button type="submit" disabled={loading || !pin} className="theme-btn-primary w-full py-2 text-sm disabled:opacity-50">
            {loading ? 'Verifying...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nav-collapsed') === 'true')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatFullscreen, setChatFullscreen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  useEffect(() => {
    // Check auth status first
    api.get('/auth/status').then(auth => {
      if (!auth.authenticated) {
        setNeedsAuth(true)
        setConfigLoaded(true)
        return
      }
      // Then check onboarding
      return api.get('/settings/app-config').then(config => {
        if (!config.onboarding_complete) {
          setShowOnboarding(true)
        }
        setConfigLoaded(true)
      })
    }).catch(() => setConfigLoaded(true))
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('nav-collapsed', String(next))
  }

  // Show PIN login for network users
  if (needsAuth) {
    return <PinLogin onSuccess={() => { setNeedsAuth(false); window.location.reload() }} />
  }

  // Loading state
  if (!configLoaded) {
    return <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
      <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
    </div>
  }

  return (
    <div className="flex h-screen-safe overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
      <nav
        className="hidden md:flex flex-col shrink-0 transition-all duration-200"
        style={{
          width: collapsed ? 56 : 224,
          backgroundColor: 'var(--color-nav-bg)',
          borderRight: '1px solid var(--color-border-light)',
        }}
      >
        <div className={`flex items-center px-3 py-3 ${collapsed ? 'flex-col gap-1' : 'gap-2'}`} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
          <AppLogo size={26} className="shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold tracking-tight truncate" style={{ color: 'var(--color-text)' }}>OpenArgentum</h1>
            </div>
          )}
          <button onClick={toggleCollapsed} className="shrink-0 p-1 rounded-md transition-colors hover:opacity-80" style={{ color: 'var(--color-text-muted)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={collapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7M19 19l-7-7 7-7'} />
            </svg>
          </button>
        </div>
        <div className="flex-1 px-2 py-3">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="mx-2 my-2" style={{ borderTop: '1px solid var(--color-border-light)' }} />}
              <div className="space-y-0.5">
                {group.items.map(item => {
                  if (item.action === 'chat') {
                    const isActive = chatFullscreen
                    return (
                      <button
                        key="chat"
                        onClick={() => { setChatFullscreen(true); setChatOpen(true) }}
                        title={collapsed ? item.label : undefined}
                        className={`w-full flex items-center rounded-lg transition-all ${isActive ? 'font-semibold' : 'font-medium'} ${collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2 text-sm'}`}
                        style={{
                          backgroundColor: isActive ? 'var(--color-nav-active)' : 'transparent',
                          color: isActive ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                        }}
                      >
                        <AureliaIcon size={18} mono className="shrink-0" />
                        {!collapsed && item.label}
                      </button>
                    )
                  }
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      title={collapsed ? item.label : undefined}
                      onClick={() => { if (chatFullscreen) { setChatFullscreen(false); setChatOpen(false) } }}
                      className={({ isActive }) =>
                        `flex items-center rounded-lg transition-all ${isActive && !chatFullscreen ? 'font-semibold' : 'font-medium'} ${collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2 text-sm'}`
                      }
                      style={({ isActive }) => ({
                        backgroundColor: isActive && !chatFullscreen ? 'var(--color-nav-active)' : 'transparent',
                        color: isActive && !chatFullscreen ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                      })}
                    >
                      <NavIcon path={item.icon} />
                      {!collapsed && item.label}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <SidebarFooter collapsed={collapsed} />
      </nav>
      {/* Main content — hidden when chat is fullscreen */}
      {!chatFullscreen && (
        <main className="flex-1 overflow-auto px-3 md:px-6 py-4 md:py-6 pb-24 md:pb-20 min-w-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/import" element={<Import />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      )}

      {/* Aurelia FAB — hidden when chat is open */}
      {!chatOpen && !chatFullscreen && (
        <button
          onClick={() => setChatOpen(true)}
          title="Ask Aurelia"
          className="fixed bottom-6 right-6 z-40 hidden md:flex items-center gap-2.5 pl-3.5 pr-5 py-3 rounded-full shadow-lg transition-all hover:shadow-xl hover:scale-105"
          style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
        >
          <AureliaIcon size={38} className="self-end -mb-2.5" />
          <span className="text-base font-semibold leading-none">Ask Aurelia</span>
        </button>
      )}

      {/* Mobile bottom tab bar — always visible on mobile, even when chat is open */}
      <MobileBottomNav
        chatActive={chatOpen || chatFullscreen}
        onChatOpen={() => { setChatOpen(true); setChatFullscreen(false) }}
        onCloseChat={() => { setChatOpen(false); setChatFullscreen(false) }}
      />

      <ChatErrorBoundary onClose={() => { setChatOpen(false); setChatFullscreen(false) }}>
        <ChatPanel open={chatOpen || chatFullscreen} fullscreen={chatFullscreen} isMobile={isMobile}
          onClose={() => { setChatOpen(false); setChatFullscreen(false) }}
          onToggleFullscreen={() => { setChatFullscreen(f => !f); if (!chatOpen) setChatOpen(true) }}
          onNavigate={(path) => { if (chatFullscreen) setChatFullscreen(false); navigate(path) }} />
      </ChatErrorBoundary>
      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
    </div>
  )
}
