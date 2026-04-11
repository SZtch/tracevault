'use client'

import { useState } from 'react'
import SearchPanel from '@/components/SearchPanel'
import ResultCard from '@/components/ResultCard'
import StatusBar from '@/components/StatusBar'
import IndexPanel from '@/components/IndexPanel'
import TriageBrief from '@/components/TriageBrief'
import DashboardPanel from '@/components/DashboardPanel'
import { SearchIcon, DatabaseIcon, ZapIcon, ActivityIcon } from '@/components/Icons'

// ── Sidebar nav item ───────────────────────────────────────────────────────
function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-3 w-full px-3 py-2 rounded-md text-left transition-all duration-150',
        'text-sm font-medium border border-transparent',
        active
          ? 'nav-active'
          : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-4)] hover:border-[var(--border)]',
      ].join(' ')}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </button>
  )
}

const SAMPLE_QUERIES = [
  'connection pool exhausted',
  'gRPC deadline exceeded',
  'OOMKilled pod restart',
]

export default function Home() {
  const [results,     setResults]     = useState([])
  const [query,       setQuery]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [view,        setView]        = useState('search')
  const [triageBrief, setTriageBrief] = useState(null)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r"
        style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
            style={{
              background: 'var(--accent-dim)',
              border:     '1px solid var(--accent-mid)',
            }}
          >
            <ZapIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div
              className="font-semibold text-[15px] tracking-tight"
              style={{ color: 'var(--text-bright)', fontFamily: 'var(--sans)' }}
            >
              TraceVault
            </div>
            <div
              className="font-mono text-[9px] tracking-widest uppercase mt-0.5"
              style={{ color: 'var(--text-faint)' }}
            >
              Incident Search
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          <div className="nav-section mb-2">Workspace</div>
          <NavItem icon={SearchIcon}   label="Search"    active={view === 'search'}    onClick={() => setView('search')} />
          <NavItem icon={DatabaseIcon} label="Index"     active={view === 'index'}     onClick={() => { setView('index');     setTriageBrief(null) }} />
          <NavItem icon={ActivityIcon} label="Dashboard" active={view === 'dashboard'} onClick={() => { setView('dashboard'); setTriageBrief(null) }} />
        </nav>

        {/* Status footer */}
        <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <StatusBar />
        </div>
      </aside>

      {/* ── Mobile Top Bar ──────────────────────────────────────────────── */}
      <div
        className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 border-b"
        style={{ background: 'var(--bg-2)', borderColor: 'var(--border)', height: '50px' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}
          >
            <ZapIcon className="w-3 h-3" style={{ color: 'var(--accent)' }} />
          </div>
          <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text-bright)' }}>
            TraceVault
          </span>
        </div>
        <div className="flex gap-1">
          {[
            { id: 'search',    Icon: SearchIcon,    label: 'Search'    },
            { id: 'index',     Icon: DatabaseIcon,  label: 'Index'     },
            { id: 'dashboard', Icon: ActivityIcon,  label: 'Dashboard' },
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => { setView(id); if (id !== 'search') setTriageBrief(null) }}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border transition-all duration-150',
                view === id
                  ? 'nav-active'
                  : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden lg:pt-0 pt-[50px]">

        {view === 'search' ? (
          <>
            <SearchPanel
              query={query}
              setQuery={setQuery}
              setResults={setResults}
              setLoading={setLoading}
              loading={loading}
              setTriageBrief={setTriageBrief}
            />

            <div
              className="flex-1 overflow-y-auto px-6 py-6 sm:px-8 dot-bg"
              style={{ background: 'var(--bg)' }}
            >
              {/* Loading */}
              {loading && (
                <div className="animate-fade-in">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="animate-pulse-dot w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                    <span className="text-sm" style={{ color: 'var(--text-dim)' }}>
                      Scanning incident vault…
                    </span>
                  </div>
                  <div className="search-shimmer" />
                  {[1, 2, 3].map(i => (
                    <div
                      key={i}
                      className="rounded-xl mb-3 border-l-2 border-l-transparent"
                      style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', padding: '20px 22px', opacity: 1 - i * 0.22 }}
                    >
                      <div className="flex justify-between mb-3">
                        <div className="flex gap-2">
                          <div className="skeleton h-3 w-8 rounded" />
                          <div className="skeleton h-3 w-24 rounded" />
                          <div className="skeleton h-3 w-16 rounded" />
                        </div>
                        <div className="skeleton h-3 w-20 rounded" />
                      </div>
                      <div className="skeleton h-5 w-3/5 rounded mb-3" />
                      <div className="skeleton h-3 w-full rounded mb-2" />
                      <div className="skeleton h-3 w-4/5 rounded" />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty — no query yet */}
              {!loading && results.length === 0 && !query && (
                <div className="animate-fade-in flex flex-col items-center justify-center min-h-[380px] text-center">
                  <div
                    className="flex items-center justify-center w-12 h-12 rounded-xl mb-6"
                    style={{ background: 'var(--bg-3)', border: '1px solid var(--border-bright)' }}
                  >
                    <SearchIcon className="w-5 h-5" style={{ color: 'var(--text-dim)' }} />
                  </div>
                  <p
                    className="font-mono text-[10px] tracking-widest uppercase mb-3"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    Incident Similarity Search
                  </p>
                  <p className="text-base max-w-sm leading-relaxed mb-2" style={{ color: 'var(--text)' }}>
                    Paste an error message, stack trace, or alert description.
                  </p>
                  <p className="text-sm max-w-xs leading-relaxed mb-7" style={{ color: 'var(--text-dim)' }}>
                    TraceVault surfaces the closest past incidents — ranked by similarity,
                    with root causes and confirmed fixes attached.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SAMPLE_QUERIES.map(q => (
                      <button
                        key={q}
                        onClick={() => setQuery(q)}
                        className="font-mono text-[11px] px-3 py-1.5 rounded-md border transition-all duration-150"
                        style={{ background: 'var(--bg-3)', borderColor: 'var(--border-bright)', color: 'var(--text-dim)' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-mid)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg-4)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-bright)'; e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'var(--bg-3)' }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty — searched, no results */}
              {!loading && results.length === 0 && query && (
                <div className="animate-fade-in flex flex-col items-center justify-center min-h-[280px] text-center">
                  <p className="text-sm mb-1.5" style={{ color: 'var(--text-dim)' }}>No similar incidents found</p>
                  <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
                    Try a different query or load sample data via the Index tab.
                  </p>
                </div>
              )}

              {/* Triage Brief */}
              {!loading && triageBrief && results.length > 0 && (
                <TriageBrief brief={triageBrief} />
              )}

              {/* Results header */}
              {!loading && results.length > 0 && (
                <div className="flex items-baseline gap-3 mb-4 animate-fade-in flex-wrap">
                  <span
                    className="font-mono text-[11px] font-semibold tracking-widest uppercase"
                    style={{ color: 'var(--accent)' }}
                  >
                    {results.length} match{results.length !== 1 ? 'es' : ''}
                  </span>
                  <span className="font-mono text-[11px] truncate max-w-md" style={{ color: 'var(--text-dim)' }}>
                    &ldquo;{query.trim().slice(0, 90)}{query.trim().length > 90 ? '…' : ''}&rdquo;
                  </span>
                </div>
              )}

              {!loading && results.map((r, i) => (
                <ResultCard key={r.incident_id || String(r.id)} result={r} rank={i + 1} />
              ))}
            </div>
          </>
        ) : view === 'dashboard' ? (
          <div className="flex-1 overflow-y-auto px-6 py-7 sm:px-8">
            <DashboardPanel />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-7 sm:px-8">
            <IndexPanel />
          </div>
        )}
      </div>
    </div>
  )
}
