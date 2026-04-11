'use client'

import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Semantic severity colors — aligned with new palette
const SEV = {
  critical: { bg: 'rgba(239,68,68,0.09)',   border: 'rgba(239,68,68,0.22)',   text: '#EF4444', bar: '#EF4444' },
  high:     { bg: 'rgba(245,158,11,0.09)',  border: 'rgba(245,158,11,0.22)',  text: '#F59E0B', bar: '#F59E0B' },
  medium:   { bg: 'rgba(234,179,8,0.09)',   border: 'rgba(234,179,8,0.22)',   text: '#EAB308', bar: '#EAB308' },
  low:      { bg: 'rgba(34,197,94,0.09)',   border: 'rgba(34,197,94,0.22)',   text: '#22C55E', bar: '#22C55E' },
}

const STATUS_STYLE = {
  open:      { color: 'var(--text-dim)'  },
  resolved:  { color: 'var(--accent)'   },
  confirmed: { color: 'var(--success)'  },
}

function StatCard({ label, value, sub, accentColor }) {
  return (
    <div className="rounded-lg border flex flex-col overflow-hidden" style={{ background: 'var(--bg-3)', borderColor: 'var(--border)' }}>
      {accentColor && (
        <div style={{ height: '2px', background: accentColor, opacity: 0.8 }} />
      )}
      <div className="p-4 flex flex-col gap-1.5">
        <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>
          {label}
        </span>
        <span
          className="font-mono text-[26px] font-semibold leading-none tracking-tight tabular-nums"
          style={{ color: 'var(--text-bright)' }}
        >
          {value}
        </span>
        {sub && (
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-faint)' }}>{sub}</span>
        )}
      </div>
    </div>
  )
}

function Bar({ pct, color }) {
  return (
    <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-5)', height: '4px' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function DashboardPanel() {
  const [data,      setData]      = useState(null)
  const [recurring, setRecurring] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  async function reload() {
    setLoading(true); setError(null)
    try {
      const [dashRes, recurRes] = await Promise.all([
        fetch(`${API}/analytics/dashboard`),
        fetch(`${API}/analytics/recurring?top_k=5`),
      ])
      if (!dashRes.ok)  throw new Error(`Dashboard HTTP ${dashRes.status}`)
      if (!recurRes.ok) throw new Error(`Recurring HTTP ${recurRes.status}`)
      setData(await dashRes.json())
      setRecurring(await recurRes.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { reload() }, [])

  if (loading) return (
    <div className="flex items-center gap-3 py-12">
      <div className="animate-pulse-dot w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
      <span className="text-sm" style={{ color: 'var(--text-dim)', fontFamily: 'var(--sans)' }}>Loading dashboard…</span>
    </div>
  )

  if (error) return (
    <div className="text-sm py-4 px-4 rounded-lg border" style={{ color: 'var(--danger)', background: 'var(--danger-dim)', borderColor: 'var(--danger-border)', fontFamily: 'var(--sans)' }}>
      ⚠ {error}
    </div>
  )

  const total = data.total_incidents || 1
  const sev   = data.by_severity || {}

  return (
    <div className="animate-fade-in space-y-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2
            className="text-base font-semibold tracking-tight"
            style={{ color: 'var(--text-bright)', fontFamily: 'var(--sans)' }}
          >
            Dashboard
          </h2>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {data.total_incidents.toLocaleString()} indexed incidents
          </p>
        </div>
        <button
          onClick={reload}
          className="font-mono text-[11px] px-3 py-1.5 rounded border transition-all duration-150"
          style={{ borderColor: 'var(--border)', color: 'var(--text-dim)', background: 'var(--bg-3)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total"    value={data.total_incidents}                                accentColor="var(--accent)" />
        <StatCard label="Open"     value={data.open_count}     sub="unresolved"                accentColor="var(--danger)" />
        <StatCard label="Resolved" value={data.resolved_count} sub={`${data.confirmed_count} confirmed`} accentColor="var(--success)" />
        <StatCard label="Fix Rate" value={`${data.resolution_rate}%`}                          accentColor="var(--warning)" />
      </div>

      {/* Severity breakdown */}
      <div>
        <p className="font-mono text-[9px] tracking-widest uppercase mb-4" style={{ color: 'var(--text-dim)' }}>
          By Severity
        </p>
        <div className="space-y-3">
          {['critical', 'high', 'medium', 'low'].map(s => {
            const count = sev[s] || 0
            const pct   = Math.round(count / total * 100)
            const c     = SEV[s]
            return (
              <div key={s} className="flex items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-wider w-14 flex-shrink-0" style={{ color: c.text }}>
                  {s}
                </span>
                <Bar pct={pct} color={c.bar} />
                <span className="font-mono text-[11px] w-7 text-right flex-shrink-0 tabular-nums" style={{ color: 'var(--text-mid)' }}>{count}</span>
                <span className="font-mono text-[10px] w-8 text-right flex-shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recurring Failures */}
      {recurring?.patterns?.length > 0 && (
        <div>
          <p className="font-mono text-[9px] tracking-widest uppercase mb-4" style={{ color: 'var(--text-dim)' }}>
            Recurring Failures
          </p>
          <div className="space-y-2">
            {recurring.patterns.map((p, i) => {
              const c        = SEV[p.top_severity] || SEV.medium
              const maxCount = recurring.patterns[0].count
              const pct      = Math.round(p.count / maxCount * 100)
              return (
                <div key={i} className="rounded-lg px-4 py-3 border" style={{ background: 'var(--bg-3)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <span
                      className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
                    >
                      {p.top_severity}
                    </span>
                    <span className="text-sm flex-1 truncate font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                      {p.failure_mode}
                    </span>
                    <span className="font-mono text-[12px] flex-shrink-0 font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                      {p.count}×
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Bar pct={pct} color="var(--accent)" />
                    <span className="font-mono text-[10px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
                      {p.affected_services.length} svc{p.affected_services.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="font-mono text-[10px] mt-2" style={{ color: 'var(--text-faint)' }}>
            {recurring.total_patterns} patterns · {recurring.total_incidents} incidents
          </p>
        </div>
      )}

      {/* Top services + Recent incidents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">

        <div>
          <p className="font-mono text-[9px] tracking-widest uppercase mb-4" style={{ color: 'var(--text-dim)' }}>
            Top Services
          </p>
          <div className="space-y-2.5">
            {data.by_service.slice(0, 8).map(({ service, count }) => {
              const pct = Math.round(count / total * 100)
              return (
                <div key={service} className="flex items-center gap-2.5">
                  <span className="text-sm truncate flex-shrink-0 font-medium" style={{ color: 'var(--text)', width: '120px', fontFamily: 'var(--sans)' }}>
                    {service}
                  </span>
                  <Bar pct={pct} color="var(--accent)" />
                  <span className="font-mono text-[10px] w-5 text-right flex-shrink-0 tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <p className="font-mono text-[9px] tracking-widest uppercase mb-4" style={{ color: 'var(--text-dim)' }}>
            Recent Incidents
          </p>
          <div className="space-y-2">
            {data.recent_incidents.slice(0, 8).map(inc => {
              const s  = SEV[inc.severity] || SEV.medium
              const st = STATUS_STYLE[inc.resolution_status] || STATUS_STYLE.open
              return (
                <div key={inc.incident_id} className="rounded-md px-3 py-2.5 border" style={{ background: 'var(--bg-3)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
                    >
                      {inc.severity}
                    </span>
                    <span className="font-mono text-[9px]" style={{ color: 'var(--text-faint)' }}>{inc.date || '—'}</span>
                    <span className="font-mono text-[9px] ml-auto" style={st}>{inc.resolution_status}</span>
                  </div>
                  <p className="text-sm truncate font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--sans)' }}>{inc.title}</p>
                  {inc.service && (
                    <p className="font-mono text-[10px] truncate mt-0.5" style={{ color: 'var(--text-faint)' }}>{inc.service}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
