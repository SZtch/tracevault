'use client'

import { useState, useEffect } from 'react'
import { SearchIcon, ZapIcon } from '@/components/Icons'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function SearchPanel({
  query, setQuery,
  setResults, setLoading, loading,
  setTriageBrief, setSearched, setSearchError, searchError,
}) {
  const [severity,   setSeverity]   = useState('')
  const [service,    setService]    = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [tagsInput,  setTagsInput]  = useState('')
  const [services,   setServices]   = useState([])
  const [severities, setSeverities] = useState([])
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    async function loadMeta() {
      try {
        const res  = await fetch(`${API}/meta`)
        const data = await res.json()
        setServices(data.services   || [])
        setSeverities(data.severities || [])
      } catch { /* DB not ready */ }
    }
    loadMeta()
  }, [])

  async function runSearch(q) {
    const text = (q ?? query).trim()
    if (!text) return
    setLoading(true); setResults([]); setSearchError(null)
    if (setTriageBrief) setTriageBrief(null)
    if (setSearched)    setSearched(false)

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
      if (setSearched) setSearched(true)
    } catch (e) {
      setSearchError(e.message || 'Search failed — backend may be unavailable')
      setResults([])
      if (setSearched) setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch() }
  }

  const hasActiveFilters = severity || service || dateFrom || dateTo || tagsInput.trim()

  return (
    <div>
      {/* ── Search box ── */}
      <div className="search-box">

        {/* Tag row */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            {['UTF-8', 'LOG_STREAM_01'].map(tag => (
              <span
                key={tag}
                className="font-mono text-[9px] px-2 py-0.5 rounded"
                style={{ background: 'var(--bg-5)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}
              >
                {tag}
              </span>
            ))}
            {hasActiveFilters && (
              <span
                className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)', color: 'var(--accent)' }}
              >
                filtered
              </span>
            )}
          </div>
          <span className="font-mono text-[9px] hidden sm:block" style={{ color: 'var(--text-faint)' }}>
            Enter ↵ to search
          </span>
        </div>

        {/* Textarea */}
        <textarea
          className="query-input"
          style={{
            background:   'transparent',
            border:       'none',
            borderRadius: '0',
            minHeight:    '168px',
            padding:      '14px 16px',
          }}
          placeholder={`Paste stack trace or error message here...\ne.g. Caused by: io.lettuce.core.RedisConnectionException: Unable to connect to [127.0.0.1:6379]`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          spellCheck={false}
        />

        {/* Action row */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFilters(p => !p)}
              className="flex items-center gap-1.5 font-mono text-[10px] transition-colors"
              style={{ color: showFilters ? 'var(--accent)' : 'var(--text-dim)' }}
            >
              <span>⊕</span> Attach Log File
            </button>
            <button
              onClick={() => setShowFilters(p => !p)}
              className="flex items-center gap-1.5 font-mono text-[10px] transition-colors"
              style={{ color: showFilters ? 'var(--accent)' : 'var(--text-dim)' }}
            >
              <span>↺</span> Recent Pastes
            </button>
          </div>

          <button
            onClick={() => runSearch()}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-md font-mono text-[11px] font-semibold tracking-wide transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={
              loading || !query.trim()
                ? { background: 'var(--bg-5)', color: 'var(--text-dim)', border: '1px solid var(--border)' }
                : { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
            }
            onMouseEnter={e => { if (!loading && query.trim()) e.currentTarget.style.background = '#6B9FFF' }}
            onMouseLeave={e => { if (!loading && query.trim()) e.currentTarget.style.background = 'var(--accent)' }}
          >
            <ZapIcon className="w-3.5 h-3.5" />
            {loading ? 'Scanning…' : 'Find Similar Incidents'}
          </button>
        </div>
      </div>

      {/* ── Filters (collapsible) ── */}
      {showFilters && (
        <div className="mt-2.5 flex flex-col gap-2 animate-fade-in">
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
                style={{
                  background:  'var(--bg-3)',
                  borderColor: 'var(--border)',
                  color:       value ? 'var(--text)' : 'var(--text-dim)',
                }}
              >
                <option value="">{placeholder}</option>
                {options.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ))}
            <input
              type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="filter-select text-[11px] px-3 py-1.5 rounded border"
              style={{ background: 'var(--bg-3)', borderColor: 'var(--border)', color: dateFrom ? 'var(--text)' : 'var(--text-dim)' }}
            />
            <span className="font-mono text-[10px] self-center" style={{ color: 'var(--text-faint)' }}>→</span>
            <input
              type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="filter-select text-[11px] px-3 py-1.5 rounded border"
              style={{ background: 'var(--bg-3)', borderColor: 'var(--border)', color: dateTo ? 'var(--text)' : 'var(--text-dim)' }}
            />
            <input
              type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="tag: kafka, grpc…"
              className="filter-select text-[11px] px-3 py-1.5 rounded border"
              style={{ background: 'var(--bg-3)', borderColor: 'var(--border)', color: tagsInput ? 'var(--text)' : 'var(--text-dim)', minWidth: '150px' }}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {searchError && (
        <div
          className="flex items-start gap-2 mt-3 px-3.5 py-2.5 rounded-md text-sm"
          style={{ background: 'var(--danger-dim)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}
        >
          <span className="flex-shrink-0 mt-px">⚠</span>
          <span>{searchError}</span>
        </div>
      )}
    </div>
  )
}
