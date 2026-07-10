import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api } from '../api'

const FIELD_LABELS = {
  date: 'Date',
  description: 'Description',
  description_raw: 'Raw description',
  amount_cents: 'Amount',
  category_id: 'Category',
  tier_id: 'Tier',
  is_transfer: 'Transfer',
  needs_review: 'Needs review',
}

const fieldLabel = (f) => FIELD_LABELS[f] || f
const displayValue = (label, value) => (label != null && label !== '' ? label : (value == null || value === '' ? '—' : value))

export default function TransactionHistory({ transactionId, onClose }) {
  const queryClient = useQueryClient()

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ['transaction-overrides', transactionId],
    queryFn: () => api.get(`/transactions/${transactionId}/overrides`),
  })

  const revert = useMutation({
    mutationFn: (field_name) => api.post(`/transactions/${transactionId}/overrides/revert`, { field_name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-overrides', transactionId] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })

  // Distinct fields that have history (for the revert controls).
  const fields = [...new Set(overrides.map(o => o.field_name))]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}>
      <div className="theme-card w-full max-w-lg max-h-[80vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Edit history</h3>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded hover:opacity-70" style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        {isLoading ? (
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
        ) : overrides.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No edits recorded for this transaction.</div>
        ) : (
          <>
            <div className="space-y-2">
              {overrides.map(o => (
                <div key={o.id} className="text-xs rounded px-2 py-1.5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-light)' }}>
                  <div className="flex justify-between mb-0.5">
                    <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>{fieldLabel(o.field_name)}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {o.author_type === 'aurelia' ? 'Aurelia' : 'You'} · {new Date(o.created_at + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ color: 'var(--color-text)' }}>
                    <span style={{ color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>{displayValue(o.old_label, o.old_value)}</span>
                    {' → '}
                    <span className="font-medium">{displayValue(o.new_label, o.new_value)}</span>
                  </div>
                  {o.note && <div className="mt-0.5 italic" style={{ color: 'var(--color-text-muted)' }}>{o.note}</div>}
                </div>
              ))}
            </div>

            <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
              <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Revert a field to its original value</div>
              <div className="flex flex-wrap gap-1.5">
                {fields.map(f => (
                  <button key={f} onClick={() => revert.mutate(f)} disabled={revert.isPending}
                    className="theme-btn-secondary px-2 py-1 text-xs disabled:opacity-50">
                    Revert {fieldLabel(f)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
