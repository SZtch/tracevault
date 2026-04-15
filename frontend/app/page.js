'use client'

import { useState } from 'react'
import ResultCard from '@/components/ResultCard'
import StatusBar from '@/components/StatusBar'
import IndexPanel from '@/components/IndexPanel'
import TriageBrief from '@/components/TriageBrief'
import DashboardPanel from '@/components/DashboardPanel'
import SearchPanel from '@/components/SearchPanel'
import { SearchIcon, DatabaseIcon, ZapIcon, ActivityIcon } from '@/components/Icons'

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`nav-item ${active ? 'nav-item-active' : ''}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </button>
  )
}

export default function Home() {
  const [results,     setResults]     = useState([])
  const [query,       setQuery]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [view,        setView]        = useState('search')
  const [triageBrief, setTriageBrief] = useState(null)
  const [searched,    setSearched]    = useState(false)
  const [searchError, setSearchError] = useState(null)

  function switchView(v) {
    setView(v)
    if (v !== 'search') { setTriageBrief(null); setSearched(false); setSearchError(null) }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-56 flex-shrink-0"
        style={{ background: 'var(--bg-2)', borderRight: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}
          >
            <ZapIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text-bright)' }}>
              TraceVault
            </div>
            <div className="font-mono text-[8px] tracking-widest uppercase mt-0.5" style={{ color: 'var(--text-faint)' }}>
              Incident Intelligence
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          <div className="nav-section mb-2">Workspace</div>
          <NavItem icon={SearchIcon}   label="Search"    active={view === 'search'}    onClick={() => switchView('search')} />
          <NavItem icon={DatabaseIcon} label="Index"     active={view === 'index'}     onClick={() => switchView('index')} />
          <NavItem icon={ActivityIcon} label="Dashboard" active={view === 'dashboard'} onClick={() => switchView('dashboard')} />
        </nav>

        {/* Status */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <StatusBar />
        </div>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────────────── */}
      <div
        className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4"
        style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', height: '50px' }}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}>
            <ZapIcon className="w-3 h-3" style={{ color: 'var(--accent)' }} />
          </div>
          <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text-bright)' }}>TraceVault</span>
        </div>
        <div className="flex gap-1">
          {[
            { id: 'search', Icon: SearchIcon, label: 'Search' },
            { id: 'index',  Icon: DatabaseIcon, label: 'Index' },
            { id: 'dashboard', Icon: ActivityIcon, label: 'Dashboard' },
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => switchView(id)}
              className={`nav-item ${view === id ? 'nav-item-active' : ''}`}
              style={{ padding: '5px 10px', fontSize: '12px', width: 'auto' }}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden lg:pt-0 pt-[50px]">

        {/* Non-search views */}
        {view !== 'search' && (
          <div className="flex-1 overflow-y-auto px-6 py-7 sm:px-8">
            {view === 'dashboard' ? <DashboardPanel /> : <IndexPanel />}
          </div>
        )}

        {/* Search view — 2-col: center + right triage */}
        {view === 'search' && (
          <>
            {/* ── Center column ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-7 sm:px-8 dot-bg">

                {/* Hero headline */}
                <div className="mb-6">
                  <h1
                    className="font-bold leading-tight mb-2"
                    style={{
                      fontFamily:    'var(--sans)',
                      fontSize:      'clamp(22px, 2.8vw, 32px)',
                      color:         'var(--text-bright)',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    Find what broke{' '}
                    <span style={{ color: 'var(--accent)' }}>like this before.</span>
                  </h1>
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                    Paste an issue, stack trace, or raw log to identify historical patterns.
                  </p>
                </div>

                {/* Search box */}
                <SearchPanel
                  query={query}
                  setQuery={setQuery}
                  setResults={setResults}
                  setLoading={setLoading}
                  loading={loading}
                  setTriageBrief={setTriageBrief}
                  setSearched={setSearched}
                  setSearchError={setSearchError}
                  searchError={searchError}
                />

                {/* Loading */}
                {loading && (
                  <div className="mt-6 animate-fade-in">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="animate-pulse-dot w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                      <span className="font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>scanning incident vault…</span>
                    </div>
                    <div className="search-shimmer" />
                    {[1, 2].map(i => (
                      <div
                        key={i}
                        className="mb-3 rounded-lg overflow-hidden"
                        style={{
                          background:  'var(--bg-3)',
                          border:      '1px solid var(--border)',
                          borderLeft:  '3px solid var(--border-bright)',
                          opacity:     1 - i * 0.28,
                        }}
                      >
                        <div className="flex items-start gap-3 p-5 pb-4">
                          <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
                          <div className="flex-1">
                            <div className="skeleton h-4 w-44 rounded mb-2" />
                            <div className="skeleton h-3 w-64 rounded" />
                          </div>
                          <div className="skeleton h-8 w-12 rounded" />
                        </div>
                        <div className="grid grid-cols-2 gap-4 px-5 pb-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                          <div>
                            <div className="skeleton h-2.5 w-24 rounded mb-2" />
                            <div className="skeleton h-3 w-full rounded mb-1.5" />
                            <div className="skeleton h-3 w-4/5 rounded" />
                          </div>
                          <div>
                            <div className="skeleton h-2.5 w-24 rounded mb-2" />
                            <div className="skeleton h-3 w-full rounded mb-1.5" />
                            <div className="skeleton h-3 w-3/4 rounded" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty — before first search */}
                {!loading && !searched && (
                  <div className="mt-8 flex flex-col items-center justify-center py-6 text-center">
                    <p className="font-mono text-[10px] tracking-widest uppercase mb-2" style={{ color: 'var(--text-faint)' }}>
                      Ready to scan
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                      Results will appear here after searching.
                    </p>
                  </div>
                )}

                {/* No results after search */}
                {!loading && searched && results.length === 0 && (
                  <div className="mt-6 flex flex-col items-center justify-center py-6 text-center">
                    <p className="text-sm mb-1" style={{ color: 'var(--text-dim)' }}>No similar incidents found.</p>
                    <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
                      Try a different query or load sample data via Index.
                    </p>
                  </div>
                )}

                {/* Results header */}
                {!loading && results.length > 0 && (
                  <div className="mt-6 flex items-center gap-3 mb-4 animate-fade-in">
                    <span className="font-mono text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-mid)' }}>
                      Matching Incidents
                    </span>
                    <span
                      className="font-mono text-[9px] px-2 py-0.5 rounded"
                      style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)', color: 'var(--accent)' }}
                    >
                      {results.length} Matches Found
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="font-mono text-[9px]" style={{ color: 'var(--text-faint)' }}>Sort by:</span>
                      <span className="font-mono text-[9px] font-semibold" style={{ color: 'var(--text-dim)' }}>Similarity ↓</span>
                    </div>
                  </div>
                )}

                {/* Result cards */}
                {!loading && results.map((r, i) => (
                  <ResultCard key={r.incident_id || String(r.id)} result={r} rank={i + 1} />
                ))}
              </div>
            </div>

            {/* ── Right panel: Triage Brief ─────────────────────────── */}
            <div
              className="hidden lg:flex flex-col w-72 flex-shrink-0 overflow-y-auto"
              style={{ background: 'var(--bg-2)', borderLeft: '1px solid var(--border)' }}
            >
              <TriageBrief brief={triageBrief} loading={loading} searched={searched} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
