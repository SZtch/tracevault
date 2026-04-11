'use client'

import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const SEV = {
  critical: { bg: 'var(--red-dim)',          border: 'var(--red-border)',        text: 'var(--red)'     },
  high:     { bg: 'rgba(224,128,32,.12)',    border: 'rgba(224,128,32,.28)',     text: 'var(--orange)'  },
  medium:   { bg: 'rgba(212,176,48,.10)',    border: 'rgba(212,176,48,.25)',     text: 'var(--yellow)'  },
  low:      { bg: 'var(--accent-dim)',        border: 'var(--accent-mid)',        text: 'var(--accent)'  },
}

const STATUS_COLOR = {
  open:      { text: 'var(--text-dim)' },
  resolved:  { text: 'var(--accent)'   },
  confirmed: { text: '#4090d0'          },
}

function StatCard({ label, value, sub }) {
  return (
    <div
      className="rounded-lg p-4 border flex flex-col gap-1"
      style={{ background: 'var(--bg-3)', borderColor: 'var(--border)' }}
    >
      <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>
        {label}
      </span>
      <span className="font-mono text-2xl font-semibold leading-none" style={{ color: 'var(--text-bright)' }}>
        {value}
      </span>
      {sub && (
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>{sub}</span>
      )}
    </div>
  )
}

function Bar({ pct, color }) {
  return (
    <div className="flex-1 rounded-full overflow-hidden h-1.5" style={{ background: 'var(--bg-5)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

export default function DashboardPanel() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  async function reload() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/analytics/dashboard`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  if (loading) return (
    <div className="flex items-center gap-3 py-12">
      <div className="animate-pulse-dot w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
      <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>Loading dashboard…</span>
    </div>
  )

  if (error) return (
    <div className="font-mono text-xs py-6" style={{ color: 'var(--red)' }}>
      ⚠ Failed to load: {error}
    </div>
  )

  const total = data.total_incidents || 1
  const sev   = data.by_severity || {}

  return (
    <div className="animate-fade-in space-y-7 max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-[10px] tracking-widest uppercase font-semibold" style={{ color: 'var(--text-dim)' }}>
            Dashboard
          </h2>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-dim)', opacity: 0.55 }}>
            {data.total_incidents} indexed incidents
          </p>
        </div>
        <button
          onClick={reload}
          className="font-mono text-[10px] px-3 py-1.5 rounded border transition-colors duration-150"
          style={{ borderColor: 'var(--border)', color: 'var(--text-dim)', background: 'var(--bg-3)' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total"       value={data.total_incidents} />
        <StatCard label="Open"        value={data.open_count}      sub="unresolved" />
        <StatCard label="Resolved"    value={data.resolved_count}  sub={`${data.confirmed_count} confirmed`} />
        <StatCard label="Fix Rate"    value={`${data.resolution_rate}%`} />
      </div>

      {/* Severity breakdown */}
      <div>
        <div className="font-mono text-[9px] tracking-widest uppercase mb-3" style={{ color: 'var(--text-dim)' }}>
          By Severity
        </div>
        <div className="space-y-2">
          {['critical', 'high', 'medium', 'low'].map(s => {
            const count = sev[s] || 0
            const pct   = Math.round(count / total * 100)
            const c     = SEV[s]
            return (
              <div key={s} className="flex items-center gap-3">
                <span
                  className="font-mono text-[10px] uppercase tracking-wider w-14 flex-shrink-0"
                  style={{ color: c.text }}
                >
                  {s}
                </span>
                <Bar pct={pct} color={c.text} />
                <span className="font-mono text-[11px] w-8 text-right flex-shrink-0" style={{ color: 'var(--text-mid)' }}>
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top services + Recent incidents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

        {/* Top services */}
        <div>
          <div className="font-mono text-[9px] tracking-widest uppercase mb-3" style={{ color: 'var(--text-dim)' }}>
            Top Services
          </div>
          <div className="space-y-2">
            {data.by_service.slice(0, 8).map(({ service, count }) => {
              const pct = Math.round(count / total * 100)
              return (
                <div key={service} className="flex items-center gap-2">
                  <span className="font-mono text-[11px] truncate" style={{ color: 'var(--text)', width: '130px', flexShrink: 0 }}>
                    {service}
                  </span>
                  <Bar pct={pct} color="var(--accent)" />
                  <span className="font-mono text-[11px] w-7 text-right flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent incidents */}
        <div>
          <div className="font-mono text-[9px] tracking-widest uppercase mb-3" style={{ color: 'var(--text-dim)' }}>
            Recent Incidents
          </div>
          <div className="space-y-2">
            {data.recent_incidents.slice(0, 8).map(inc => {
              const s  = SEV[inc.severity] || SEV.medium
              const st = STATUS_COLOR[inc.resolution_status] || STATUS_COLOR.open
              return (
                <div
                  key={inc.incident_id}
                  className="rounded-md px-3 py-2 border"
                  style={{ background: 'var(--bg-3)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
                    >
                      {inc.severity}
                    </span>
                    <span className="font-mono text-[9px]" style={{ color: 'var(--text-dim)' }}>
                      {inc.date || '—'}
                    </span>
                    <span className="font-mono text-[9px] ml-auto" style={st}>
                      {inc.resolution_status}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] truncate" style={{ color: 'var(--text)' }}>
                    {inc.title}
                  </p>
                  {inc.service && (
                    <p className="font-mono text-[10px] truncate mt-0.5" style={{ color: 'var(--text-dim)' }}>
                      {inc.service}
                    </p>
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
