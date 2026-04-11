'use client'

import { useState, useEffect } from 'react'
import { SearchIcon } from '@/components/Icons'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function SearchPanel({ query, setQuery, setResults, setLoading, loading, setTriageBrief }) {
  const [severity,    setSeverity]    = useState('')
  const [service,     setService]     = useState('')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [tagsInput,   setTagsInput]   = useState('')
  const [services,    setServices]    = useState([])
  const [severities,  setSeverities]  = useState([])
  const [searchError, setSearchError] = useState(null)

  useEffect(() => {
    async function loadMeta() {
      try {
        const res  = await fetch(`${API}/meta`)
        const data = await res.json()
        setServices(data.services   || [])
        setSeverities(data.severities || [])
      } catch { /* DB not ready — filters stay empty */ }
    }
    loadMeta()
  }, [])

  async function runSearch(q) {
    const text = (q ?? query).trim()
    if (!text) return
    setLoading(true); setResults([]); setSearchError(null)
    if (setTriageBrief) setTriageBrief(null)

    const tags = tagsInput.trim()
      ? tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      : undefined

    try {
      const res = await fetch(`${API}/search`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:     text,
          top_k:     5,
          severity:  severity  || undefined,
          service:   service   || undefined,
          date_from: dateFrom  || undefined,
          date_to:   dateTo    || undefined,
          tags,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Search failed (HTTP ${res.status})`)
      }
      const data = await res.json()
      setResults(data.results || [])
      if (setTriageBrief) setTriageBrief(data.triage_brief || null)
    } catch (e) {
      setSearchError(e.message || 'Search failed — backend may be unavailable')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch() }
  }

  const selectStyle = {
    background:  'var(--bg-3)',
    borderColor: 'var(--border)',
    color:       'var(--text-dim)',
  }

  const hasActiveFilters = severity || service || dateFrom || dateTo || tagsInput.trim()

  return (
    <div
      className="flex-shrink-0 px-6 pt-5 pb-4 sm:px-8 border-b"
      style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <SearchIcon className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
          <span className="font-mono text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>
            Incident Search
          </span>
          {hasActiveFilters && (
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)', color: 'var(--accent)' }}
            >
              filtered
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] hidden sm:block" style={{ color: 'var(--text-faint)' }}>
          Enter ↵ to search
        </span>
      </div>

      {/* Query textarea */}
      <div className="relative">
        <textarea
          className="query-input w-full rounded-lg px-4 py-3 text-[13px] leading-relaxed resize-none border transition-colors duration-150"
          style={{
            background:   'var(--bg-3)',
            borderColor:  'var(--border-bright)',
            color:        'var(--text-bright)',
            minHeight:    '90px',
            paddingRight: '112px',
          }}
          placeholder="Paste an error message, stack trace, or incident description…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          spellCheck={false}
        />
        <button
          onClick={() => runSearch()}
          disabled={loading || !query.trim()}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-4 py-2 rounded-md font-mono text-[11px] font-semibold tracking-wide transition-all duration-150 disabled:cursor-not-allowed"
          style={
            loading || !query.trim()
              ? { background: 'var(--bg-5)', color: 'var(--text-dim)' }
              : { background: 'var(--accent)', color: '#fff' }
          }
          onMouseEnter={e => { if (!loading && query.trim()) e.currentTarget.style.background = '#6B9FFF' }}
          onMouseLeave={e => { if (!loading && query.trim()) e.currentTarget.style.background = 'var(--accent)' }}
        >
          <SearchIcon className="w-3 h-3" />
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Filters */}
      <div className="mt-2.5 flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          {[
            { value: severity, onChange: setSeverity, placeholder: 'All severities', options: severities },
            { value: service,  onChange: setService,  placeholder: 'All services',   options: services   },
          ].map(({ value, onChange, placeholder, options }, idx) => (
            <select
              key={idx}
              value={value}
              onChange={e => onChange(e.target.value)}
              className="filter-select text-[11px] px-3 py-1.5 rounded border transition-colors duration-150 cursor-pointer"
              style={{ ...selectStyle, color: value ? 'var(--text)' : 'var(--text-dim)' }}
            >
              <option value="">{placeholder}</option>
              {options.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="filter-select text-[11px] px-3 py-1.5 rounded border transition-colors duration-150"
            style={{ ...selectStyle, color: dateFrom ? 'var(--text)' : 'var(--text-dim)' }}
            title="Date from (inclusive)"
          />
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-faint)' }}>→</span>
          <input
            type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="filter-select text-[11px] px-3 py-1.5 rounded border transition-colors duration-150"
            style={{ ...selectStyle, color: dateTo ? 'var(--text)' : 'var(--text-dim)' }}
            title="Date to (inclusive)"
          />
          <input
            type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="filter by tag: kafka, grpc…"
            className="filter-select text-[11px] px-3 py-1.5 rounded border transition-colors duration-150"
            style={{ ...selectStyle, color: tagsInput ? 'var(--text)' : 'var(--text-dim)', minWidth: '160px' }}
            spellCheck={false}
          />
        </div>
      </div>

      {/* Error */}
      {searchError && (
        <div
          className="flex items-start gap-2 mt-3 px-3.5 py-2.5 rounded-md text-sm"
          style={{ background: 'var(--danger-dim)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontFamily: 'var(--sans)' }}
        >
          <span className="flex-shrink-0 font-mono mt-px">⚠</span>
          <span>{searchError}</span>
        </div>
      )}
    </div>
  )
}
