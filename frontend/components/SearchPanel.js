'use client'

import { useState, useEffect } from 'react'
import { SearchIcon, SparkleIcon } from '@/components/Icons'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// The 3 strongest demo queries — each targets a distinct failure cluster.
// Phrased as an engineer would type them at 2am, not as field values.
const DEMO_QUERIES = [
  {
    label: 'Connection pool',
    query: 'HikariPool connection not available, requests timing out under load',
  },
  {
    label: 'Kafka consumer lag',
    query: 'Kafka consumer group lag growing, batch processor stuck behind',
  },
  {
    label: 'gRPC / ML inference',
    query: 'gRPC deadline exceeded on ML inference service, requests failing',
  },
]

export default function SearchPanel({ query, setQuery, setResults, setLoading, loading, setTriageBrief }) {
  const [severity,    setSeverity]    = useState('')
  const [service,     setService]     = useState('')
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
      } catch {
        // DB not ready — filters stay empty, search still works
      }
    }
    loadMeta()
  }, [])

  async function runSearch(q) {
    const text = (q ?? query).trim()
    if (!text) return
    setLoading(true)
    setResults([])
    setSearchError(null)
    if (setTriageBrief) setTriageBrief(null)
    try {
      const res = await fetch(`${API}/search`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:    text,
          top_k:    5,
          severity: severity || undefined,
          service:  service  || undefined,
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      runSearch()
    }
  }

  function handleDemo(dq) {
    setQuery(dq.query)
    runSearch(dq.query)
  }

  return (
    <div
      className="flex-shrink-0 px-6 pt-5 pb-4 sm:px-8 border-b"
      style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
    >
      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <SearchIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
          <span
            className="font-mono text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: 'var(--text-dim)' }}
          >
            Incident Search
          </span>
        </div>
        <span
          className="font-mono text-[10px] hidden sm:block"
          style={{ color: 'var(--text-dim)', opacity: 0.6 }}
        >
          Enter ↵ to search
        </span>
      </div>

      {/* ── Demo chips ── */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <div className="flex items-center gap-1 mr-0.5">
          <SparkleIcon className="w-2.5 h-2.5" style={{ color: 'var(--text-dim)' }} />
          <span
            className="font-mono text-[9px] tracking-widest uppercase"
            style={{ color: 'var(--text-dim)' }}
          >
            Try
          </span>
        </div>
        {DEMO_QUERIES.map(dq => (
          <button
            key={dq.label}
            onClick={() => handleDemo(dq)}
            disabled={loading}
            className="font-mono text-[10px] px-2.5 py-1 rounded border transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color:       'var(--accent)',
              background:  'var(--accent-dim)',
              borderColor: 'var(--accent-mid)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--accent-mid)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--accent-dim)'
            }}
          >
            {dq.label} →
          </button>
        ))}
      </div>

      {/* ── Input + button ── */}
      <div className="relative">
        <textarea
          className="query-input w-full rounded-lg px-4 py-3 font-mono text-[13px] leading-relaxed resize-none border transition-colors duration-150"
          style={{
            background:   'var(--bg-3)',
            borderColor:  'var(--border-bright)',
            color:        'var(--text-bright)',
            minHeight:    '90px',
            paddingRight: '110px',
          }}
          placeholder="Paste an error message, stack trace, or incident description…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
        />
        <button
          onClick={() => runSearch()}
          disabled={loading || !query.trim()}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-4 py-2 rounded-md font-mono text-[11px] font-semibold tracking-wide transition-all duration-150 disabled:cursor-not-allowed"
          style={
            loading || !query.trim()
              ? { background: 'var(--bg-5)', color: 'var(--text-dim)' }
              : { background: 'var(--accent)', color: 'var(--bg)' }
          }
          onMouseEnter={e => {
            if (!loading && query.trim()) e.currentTarget.style.background = '#00e0b4'
          }}
          onMouseLeave={e => {
            if (!loading && query.trim()) e.currentTarget.style.background = 'var(--accent)'
          }}
        >
          <SearchIcon className="w-3 h-3" />
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-2 mt-2.5 flex-wrap">
        {[
          {
            value: severity, onChange: setSeverity,
            placeholder: 'All severities',
            options: severities,
          },
          {
            value: service, onChange: setService,
            placeholder: 'All services',
            options: services,
          },
        ].map(({ value, onChange, placeholder, options }, idx) => (
          <select
            key={idx}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="filter-select font-mono text-[11px] px-3 py-1.5 rounded border transition-colors duration-150 cursor-pointer"
            style={{
              background:  'var(--bg-3)',
              borderColor: 'var(--border)',
              color:       value ? 'var(--text)' : 'var(--text-dim)',
            }}
          >
            <option value="">{placeholder}</option>
            {options.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ))}
      </div>

      {/* ── Search error ── */}
      {searchError && (
        <div
          className="flex items-start gap-2 mt-3 px-3.5 py-2.5 rounded-md font-mono text-xs"
          style={{
            background:  'var(--red-dim)',
            border:      '1px solid var(--red-border)',
            color:       'var(--red)',
          }}
        >
          <span className="flex-shrink-0 mt-px">⚠</span>
          <span>{searchError}</span>
        </div>
      )}
    </div>
  )
}
