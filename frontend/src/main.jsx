import { StrictMode, Component, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './ThemeContext'
import App from './App'
import './index.css'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, showDetails: false }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
  }
  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || this.state.error?.toString() || 'Unknown error'
      return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>:(</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>OpenArgentum encountered an unexpected error.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
              <button onClick={() => this.setState({ hasError: false, error: null, showDetails: false })}
                style={{ padding: '8px 20px', fontSize: 14, fontWeight: 500, backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                Try Again
              </button>
              <button onClick={() => { this.setState({ hasError: false, error: null, showDetails: false }); window.location.href = '/' }}
                style={{ padding: '8px 20px', fontSize: 14, fontWeight: 500, backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                Go Home
              </button>
            </div>
            <button onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
              style={{ fontSize: 12, color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}>
              {this.state.showDetails ? 'Hide' : 'Show'} error details
            </button>
            {this.state.showDetails && (
              <pre style={{ marginTop: 8, padding: 12, backgroundColor: '#fee2e2', color: '#991b1b', fontSize: 11, borderRadius: 8, textAlign: 'left', wordBreak: 'break-all', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                {errorMsg}
              </pre>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
