import { useState, useEffect } from 'react'
import { ThemeContext } from './theme-context'

const THEMES = [
  { id: 'mist', label: 'Mist', description: 'Soft blue-gray', preview: ['#f0f4f8', '#5b8def', '#e4ecf4'] },
  { id: 'rose', label: 'Rose', description: 'Warm blush', preview: ['#fdf2f4', '#d4728c', '#fae4ea'] },
  { id: 'sage', label: 'Sage', description: 'Earthy green', preview: ['#eef3ee', '#6aaa6a', '#dce8dc'] },
  { id: 'ember', label: 'Ember', description: 'Warm amber glow', preview: ['#faf5ef', '#d4883c', '#f0e4d4'] },
  { id: 'ocean', label: 'Ocean', description: 'Deep teal waters', preview: ['#eef5f5', '#2d9a9a', '#d8ecec'] },
  { id: 'slate', label: 'Slate', description: 'Clean monochrome', preview: ['#f4f4f5', '#6b6b76', '#e4e4e7'] },
  { id: 'nightfall', label: 'Nightfall', description: 'Deep blue dark', preview: ['#1a1e2e', '#7cacf8', '#1e2236'] },
  { id: 'aurora', label: 'Aurora', description: 'Violet dark mode', preview: ['#1e1a2e', '#b48cf8', '#241e36'] },
]

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('finance-theme') || 'mist')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('finance-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}
