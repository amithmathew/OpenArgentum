import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

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

function TierCard({ tier, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: tier.name, description: tier.description, color: tier.color, sort_order: tier.sort_order })

  const handleSave = () => { onUpdate(tier.id, form); setEditing(false) }

  if (editing) {
    return (
      <div className="theme-card p-4 space-y-3 flex-1 min-w-[240px] md:min-w-[280px]" style={{ borderColor: 'var(--color-accent)' }}>
        <input className="theme-input w-full px-3 py-1.5 text-sm font-medium" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tier name" />
        <textarea className="theme-input w-full px-3 py-1.5 text-sm resize-none" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Semantic description for LLM..." />
        <div className="flex items-center gap-3">
          <input type="color" className="h-7 w-10 rounded cursor-pointer" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Order:</span>
          <input type="number" className="theme-input w-14 px-2 py-1 text-sm" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
          <div className="flex gap-2 ml-auto">
            <button onClick={handleSave} className="theme-btn-primary px-3 py-1 text-xs">Save</button>
            <button onClick={() => setEditing(false)} className="theme-btn-secondary px-3 py-1 text-xs">Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="theme-card p-4 flex-1 min-w-[240px] md:min-w-[280px] transition-all hover:shadow-md group">
      <div className="flex items-start gap-3">
        <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: tier.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{tier.name}</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>#{tier.sort_order}</span>
          </div>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{tier.description || 'No description'}</p>
        </div>
        <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)} className="text-xs font-medium px-2 py-1.5 md:px-0 md:py-0" style={{ color: 'var(--color-accent-text)' }}>Edit</button>
          <button onClick={() => onDelete(tier.id)} className="text-xs font-medium px-2 py-1.5 md:px-0 md:py-0" style={{ color: 'var(--color-danger)' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function AddTierForm({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: '#6b7280', sort_order: 0 })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onAdd(form)
    setForm({ name: '', description: '', color: '#6b7280', sort_order: 0 })
    setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="theme-card p-3 w-full text-sm font-medium transition-colors text-center" style={{ color: 'var(--color-text-muted)', borderStyle: 'dashed' }}>
        + Add Tier
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="theme-card p-4 space-y-3" style={{ borderColor: 'var(--color-accent)' }}>
      <div className="flex gap-2">
        <input className="theme-input flex-1 px-3 py-1.5 text-sm" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tier name" autoFocus />
        <input type="color" className="h-8 w-10 rounded cursor-pointer" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
      </div>
      <textarea className="theme-input w-full px-3 py-1.5 text-sm resize-none" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Semantic description for LLM categorization..." />
      <div className="flex gap-2">
        <button type="submit" className="theme-btn-primary px-3 py-1.5 text-sm">Add Tier</button>
        <button type="button" onClick={() => setOpen(false)} className="theme-btn-secondary px-3 py-1.5 text-sm">Cancel</button>
      </div>
    </form>
  )
}

export default function Categories() {
  const queryClient = useQueryClient()

  const { data: tiers = [], isLoading: tiersLoading } = useQuery({ queryKey: ['tiers'], queryFn: () => api.get('/tiers') })
  const createTier = useMutation({ mutationFn: (data) => api.post('/tiers', data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tiers'] }) })
  const updateTier = useMutation({ mutationFn: ({ id, data }) => api.put(`/tiers/${id}`, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tiers'] }) })
  const deleteTier = useMutation({ mutationFn: (id) => api.delete(`/tiers/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tiers'] }) })

  const { data: categories = [], isLoading: catsLoading } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories') })
  const createCategory = useMutation({ mutationFn: (data) => api.post('/categories', data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }) })
  const updateCategory = useMutation({ mutationFn: ({ id, data }) => api.put(`/categories/${id}`, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }) })
  const deleteCategory = useMutation({ mutationFn: (id) => api.delete(`/categories/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }) })
  const confirmCategory = useMutation({ mutationFn: (id) => api.post(`/categories/${id}/confirm`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }) })

  const { data: tags = [], isLoading: tagsLoading } = useQuery({ queryKey: ['tags'], queryFn: () => api.get('/tags') })
  const createTag = useMutation({ mutationFn: (data) => api.post('/tags', data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags'] }) })
  const updateTag = useMutation({ mutationFn: ({ id, data }) => api.put(`/tags/${id}`, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags'] }) })
  const deleteTag = useMutation({ mutationFn: (id) => api.delete(`/tags/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags'] }) })
  const confirmTag = useMutation({ mutationFn: (id) => api.post(`/tags/${id}/confirm`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags'] }) })
  const confirmAllTags = useMutation({ mutationFn: () => api.post('/tags/confirm-all'), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags'] }) })

  const [newCatName, setNewCatName] = useState('')
  const [newCatTier, setNewCatTier] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#9ca3af')

  const [catSortBy, setCatSortBy] = useState('name')
  const [catSortDir, setCatSortDir] = useState('asc')
  const [tagSortBy, setTagSortBy] = useState('name')
  const [tagSortDir, setTagSortDir] = useState('asc')

  const handleCatSort = (field) => {
    if (catSortBy === field) setCatSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setCatSortBy(field); setCatSortDir('asc') }
  }
  const handleTagSort = (field) => {
    if (tagSortBy === field) setTagSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setTagSortBy(field); setTagSortDir('asc') }
  }

  const handleAddCategory = (e) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    createCategory.mutate({ name: newCatName, default_tier_id: newCatTier ? parseInt(newCatTier) : null })
    setNewCatName('')
    setNewCatTier('')
  }

  const { data: pendingData } = useQuery({ queryKey: ['pending-count'], queryFn: () => api.get('/transactions/pending-count') })
  const pendingCount = pendingData?.count || 0

  const categorizeMutation = useMutation({
    mutationFn: () => api.post('/transactions/categorize', { all: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); queryClient.invalidateQueries({ queryKey: ['transactions'] }); queryClient.invalidateQueries({ queryKey: ['pending-count'] }) },
  })

  const handleAddTag = (e) => {
    e.preventDefault()
    if (!newTagName.trim()) return
    createTag.mutate({ name: newTagName, color: newTagColor })
    setNewTagName('')
    setNewTagColor('#9ca3af')
  }

  const unconfirmedCount = categories.filter(c => !c.is_confirmed).length
  const unconfirmedTagCount = tags.filter(t => !t.is_confirmed).length
  const tierMap = Object.fromEntries(tiers.map(t => [t.id, t]))

  const sortedCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) => {
      let cmp = 0
      if (catSortBy === 'name') cmp = a.name.localeCompare(b.name)
      else if (catSortBy === 'tier') {
        const ta = tierMap[a.default_tier_id]?.name || ''
        const tb = tierMap[b.default_tier_id]?.name || ''
        cmp = ta.localeCompare(tb)
      }
      else if (catSortBy === 'transaction_count') cmp = a.transaction_count - b.transaction_count
      return catSortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [categories, catSortBy, catSortDir, tierMap])

  const sortedTags = useMemo(() => {
    const sorted = [...tags].sort((a, b) => {
      let cmp = 0
      if (tagSortBy === 'name') cmp = a.name.localeCompare(b.name)
      else if (tagSortBy === 'transaction_count') cmp = a.transaction_count - b.transaction_count
      return tagSortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [tags, tagSortBy, tagSortDir])

  const confirmAll = async () => {
    const unconfirmed = categories.filter(c => !c.is_confirmed)
    for (const cat of unconfirmed) {
      await api.post(`/categories/${cat.id}/confirm`)
    }
    queryClient.invalidateQueries({ queryKey: ['categories'] })
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text)' }}>Categories, Tags & Tiers</h2>

      {/* Tiers — horizontal cards */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Spend Tiers</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>— semantic labels the LLM uses for categorization</span>
        </div>
        {tiersLoading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {tiers.map(tier => (
              <TierCard key={tier.id} tier={tier} onUpdate={(id, data) => updateTier.mutate({ id, data })} onDelete={(id) => { if (confirm('Delete this tier?')) deleteTier.mutate(id) }} />
            ))}
            <AddTierForm onAdd={(data) => createTier.mutate(data)} />
          </div>
        )}
      </div>

      {/* Categories — full width table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Categories</h3>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>({categories.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => categorizeMutation.mutate()} disabled={pendingCount === 0 || categorizeMutation.isPending}
              className="theme-btn-secondary px-3 py-1.5 text-xs">
              {categorizeMutation.isPending ? 'Categorizing...' : `Categorize Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            </button>
            {unconfirmedCount > 0 && (
              <button onClick={confirmAll} className="theme-btn-primary px-3 py-1.5 text-xs">
                Confirm All ({unconfirmedCount})
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
          <input className="theme-input flex-1 px-3 py-1.5 text-sm" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Add new category..." />
          <select className="theme-input px-3 py-1.5 text-sm" value={newCatTier} onChange={e => setNewCatTier(e.target.value)}>
            <option value="">No default tier</option>
            {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="submit" className="theme-btn-primary px-4 py-1.5 text-sm">Add</button>
        </form>

        {catsLoading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        ) : categories.length === 0 ? (
          <div className="theme-card p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No categories yet. They'll be created automatically when you import and categorize statements.</p>
          </div>
        ) : (
          <div className="theme-card overflow-x-auto">
            <table className="w-full text-sm theme-table min-w-[500px]">
              <thead>
                <tr>
                  <SortHeader label="Category" field="name" sortBy={catSortBy} sortDir={catSortDir} onSort={handleCatSort} />
                  <SortHeader label="Default Tier" field="tier" sortBy={catSortBy} sortDir={catSortDir} onSort={handleCatSort} />
                  <SortHeader label="Transactions" field="transaction_count" sortBy={catSortBy} sortDir={catSortDir} onSort={handleCatSort} align="right" />
                  <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider w-32" style={{ color: 'var(--color-text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedCategories.map(cat => {
                  const tier = tierMap[cat.default_tier_id]
                  return (
                    <tr key={cat.id} style={!cat.is_confirmed ? { backgroundColor: 'var(--color-warning-bg)' } : undefined}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {tier && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tier.color }} />}
                          {!tier && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-border)' }} />}
                          <span className="font-medium" style={{ color: 'var(--color-text)' }}>{cat.name}</span>
                          {!cat.is_confirmed && <span className="theme-badge" style={{ backgroundColor: 'var(--color-badge-review-bg)', color: 'var(--color-badge-review-text)' }}>New</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select className="theme-input px-2 py-1 text-xs" value={cat.default_tier_id || ''} onChange={e => updateCategory.mutate({ id: cat.id, data: { default_tier_id: e.target.value ? parseInt(e.target.value) : null } })}>
                          <option value="">None</option>
                          {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{cat.transaction_count}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          {!cat.is_confirmed && <button onClick={() => confirmCategory.mutate(cat.id)} className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>Confirm</button>}
                          <button onClick={() => { if (confirm(`Delete "${cat.name}"?`)) deleteCategory.mutate(cat.id) }} className="text-xs font-medium" style={{ color: 'var(--color-danger)' }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tags section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Tags</h3>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>({tags.length}) — for drill-down within categories and cross-cutting labels</span>
          </div>
          {unconfirmedTagCount > 0 && (
            <button onClick={() => confirmAllTags.mutate()} className="theme-btn-primary px-3 py-1.5 text-xs">
              Confirm All ({unconfirmedTagCount})
            </button>
          )}
        </div>

        <form onSubmit={handleAddTag} className="flex gap-2 mb-4">
          <input className="theme-input flex-1 px-3 py-1.5 text-sm" value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Add new tag..." />
          <input type="color" className="h-8 w-10 rounded cursor-pointer" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} />
          <button type="submit" className="theme-btn-primary px-4 py-1.5 text-sm">Add</button>
        </form>

        {tagsLoading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        ) : tags.length === 0 ? (
          <div className="theme-card p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No tags yet. They'll be created automatically when you import statements, or add them manually above.</p>
          </div>
        ) : (
          <div className="theme-card overflow-x-auto">
            <table className="w-full text-sm theme-table min-w-[500px]">
              <thead>
                <tr>
                  <SortHeader label="Tag" field="name" sortBy={tagSortBy} sortDir={tagSortDir} onSort={handleTagSort} />
                  <SortHeader label="Transactions" field="transaction_count" sortBy={tagSortBy} sortDir={tagSortDir} onSort={handleTagSort} align="right" />
                  <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider w-32" style={{ color: 'var(--color-text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTags.map(tag => (
                  <tr key={tag.id} style={!tag.is_confirmed ? { backgroundColor: 'var(--color-warning-bg)' } : undefined}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <label className="relative w-4 h-4 shrink-0 cursor-pointer">
                          <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          <input type="color" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            value={tag.color} onChange={e => updateTag.mutate({ id: tag.id, data: { color: e.target.value } })} />
                        </label>
                        <span className="font-medium" style={{ color: 'var(--color-text)' }}>{tag.name}</span>
                        {!tag.is_confirmed && <span className="theme-badge" style={{ backgroundColor: 'var(--color-badge-review-bg)', color: 'var(--color-badge-review-text)' }}>New</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{tag.transaction_count}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        {!tag.is_confirmed && <button onClick={() => confirmTag.mutate(tag.id)} className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>Confirm</button>}
                        <button onClick={() => { if (confirm(`Delete "${tag.name}"?`)) deleteTag.mutate(tag.id) }} className="text-xs font-medium" style={{ color: 'var(--color-danger)' }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
