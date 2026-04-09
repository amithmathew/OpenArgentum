import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

export default function TransactionNotes({ transactionId }) {
  const queryClient = useQueryClient()
  const [newNote, setNewNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: notes = [] } = useQuery({
    queryKey: ['transaction-notes', transactionId],
    queryFn: () => api.get(`/transactions/${transactionId}/notes`),
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!newNote.trim() || submitting) return
    setSubmitting(true)
    try {
      await api.post(`/transactions/${transactionId}/notes`, { content: newNote.trim() })
      setNewNote('')
      queryClient.invalidateQueries({ queryKey: ['transaction-notes', transactionId] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
      <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
        Notes {notes.length > 0 && `(${notes.length})`}
      </div>
      {notes.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {notes.map(note => (
            <div key={note.id} className="text-xs rounded px-2 py-1.5" style={{ backgroundColor: note.author_type === 'aurelia' ? 'var(--color-accent-light)' : 'var(--color-surface)', border: '1px solid var(--color-border-light)' }}>
              <div className="flex justify-between mb-0.5">
                <span className="font-medium" style={{ color: note.author_type === 'aurelia' ? 'var(--color-accent-text)' : 'var(--color-text-secondary)' }}>
                  {note.author_type === 'aurelia' ? 'Aurelia' : 'You'}
                </span>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {new Date(note.created_at + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div style={{ color: 'var(--color-text)' }}>{note.content}</div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <input className="theme-input flex-1 px-2 py-1 text-xs" value={newNote}
          onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." />
        <button type="submit" disabled={!newNote.trim() || submitting}
          className="theme-btn-primary px-2 py-1 text-xs disabled:opacity-50 shrink-0">
          {submitting ? '...' : 'Add'}
        </button>
      </form>
    </div>
  )
}
