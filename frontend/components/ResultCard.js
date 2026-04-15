'use client'

import { useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const SEV_BORDER = {
  critical: '#EF4444',
  high:     '#F59E0B',
  medium:   '#EAB308',
  low:      '#22C55E',
}

const SEV_ICON = {
  critical: { bg: 'rgba(239,68,68,0.14)',  color: '#EF4444', symbol: '!' },
  high:     { bg: 'rgba(245,158,11,0.14)', color: '#F59E0B', symbol: '!' },
  medium:   { bg: 'rgba(234,179,8,0.12)',  color: '#EAB308', symbol: '~' },
  low:      { bg: 'rgba(34,197,94,0.12)',  color: '#22C55E', symbol: '✓' },
}

function SevIcon({ severity }) {
  const s = SEV_ICON[severity] || { bg: 'var(--bg-4)', color: 'var(--text-dim)', symbol: '·' }
  return (
    <div
      className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 font-mono font-bold text-sm leading-none"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}30` }}
    >
      {s.symbol}
    </div>
  )
}

export default function ResultCard({ result, rank }) {
  const score    = result.score
  const scorePct = Math.min(100, Math.round(score * 100))
  const isTop    = rank === 1

  const scoreColor =
    score >= 0.90 ? 'var(--accent)'   :
    score >= 0.75 ? 'var(--accent)'   :
    score >= 0.55 ? 'var(--warning)'  :
                    'var(--text-dim)'

  const failureMode = result.failure_mode || result.match_signals?.failure_mode || ''
  const matchReason = result.match_reason || ''
  const contextHints = result.context_hints?.filter(Boolean) ?? []
  const showReason   = matchReason && matchReason !== failureMode
  const sevBorder    = SEV_BORDER[result.severity] || 'var(--border-bright)'

  return (
    <div
      className="result-card animate-slide-up mb-3 rounded-lg overflow-hidden transition-colors duration-150"
      style={{
        background:   'var(--bg-3)',
        borderTop:    '1px solid var(--border)',
        borderRight:  '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        borderLeft:   `3px solid ${sevBorder}`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background        = 'var(--bg-4)'
        e.currentTarget.style.borderTopColor    = 'var(--border-bright)'
        e.currentTarget.style.borderRightColor  = 'var(--border-bright)'
        e.currentTarget.style.borderBottomColor = 'var(--border-bright)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background        = 'var(--bg-3)'
        e.currentTarget.style.borderTopColor    = 'var(--border)'
        e.currentTarget.style.borderRightColor  = 'var(--border)'
        e.currentTarget.style.borderBottomColor = 'var(--border)'
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-start gap-3 px-5 pt-4 pb-3.5">
        <SevIcon severity={result.severity} />

        <div className="flex-1 min-w-0">
          {/* Title */}
          <div
            className="text-[15px] font-semibold leading-snug mb-1"
            style={{ color: 'var(--text-bright)', fontFamily: 'var(--sans)' }}
          >
            {result.title}
          </div>
          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {result.service && (
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                Service: <span style={{ color: 'var(--text-mid)' }}>{result.service}</span>
              </span>
            )}
            {result.severity && (
              <>
                <span style={{ color: 'var(--border-bright)', fontSize: '10px' }}>·</span>
                <span className={`badge-${result.severity} font-mono text-[8px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded`}>
                  {result.severity.charAt(0).toUpperCase() + result.severity.slice(1)}
                </span>
              </>
            )}
            {result.incident_id && (
              <>
                <span style={{ color: 'var(--border-bright)', fontSize: '10px' }}>·</span>
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-faint)' }}>
                  {result.incident_id}
                </span>
              </>
            )}
            {result.date && (
              <>
                <span style={{ color: 'var(--border-bright)', fontSize: '10px' }}>·</span>
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-faint)' }}>
                  {result.date.split('T')[0]}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Score */}
        <div className="flex-shrink-0 text-right">
          <div
            className="font-mono font-bold tabular-nums leading-none mb-0.5"
            style={{ color: scoreColor, fontSize: '28px', letterSpacing: '-0.02em' }}
          >
            {scorePct}%
          </div>
          <div
            className="font-mono text-[7px] font-semibold tracking-widest uppercase"
            style={{ color: 'var(--text-faint)' }}
          >
            Match Confidence
          </div>
        </div>
      </div>

      {/* ── Two-column body: Root Cause | Match Reasoning ── */}
      {(result.root_cause || showReason || contextHints.length > 0) && (
        <div
          className="grid px-5 pb-4 gap-0"
          style={{
            gridTemplateColumns: result.root_cause && (showReason || contextHints.length > 0) ? '1fr 1fr' : '1fr',
            borderTop: '1px solid var(--border)',
          }}
        >
          {result.root_cause && (
            <div
              className="py-3.5 pr-4"
              style={{ borderRight: (showReason || contextHints.length > 0) ? '1px solid var(--border)' : 'none' }}
            >
              <div className="triage-section-label">Root Cause Summary</div>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                {result.root_cause}
              </p>
            </div>
          )}

          {(showReason || contextHints.length > 0) && (
            <div className={`py-3.5 ${result.root_cause ? 'pl-4' : ''}`}>
              <div className="triage-section-label">Match Reasoning</div>
              {contextHints.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {contextHints.map(hint => (
                    <span
                      key={hint}
                      className="font-mono text-[10px] px-2 py-0.5 rounded"
                      style={{ background: 'var(--bg-4)', border: '1px solid var(--border-bright)', color: 'var(--text-mid)' }}
                    >
                      {hint}
                    </span>
                  ))}
                </div>
              )}
              {showReason && (
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                  {matchReason.length > 130 ? matchReason.slice(0, 127) + '…' : matchReason}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Failure mode + tags strip ── */}
      {(failureMode || result.tags?.filter(Boolean).length > 0 || result.fix_confirmed || result.resolution_status) && (
        <div
          className="flex items-center gap-2 flex-wrap px-5 py-2"
          style={{ borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.10)' }}
        >
          {failureMode && (
            <span
              className="font-mono text-[9px] font-medium px-2.5 py-1 rounded flex items-center gap-1.5"
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)', color: 'var(--accent)' }}
            >
              <span style={{ fontSize: '7px', opacity: 0.5 }}>◈</span>
              {failureMode}
            </span>
          )}
          {result.tags?.filter(Boolean).map(tag => (
            <span
              key={tag}
              className="font-mono text-[9px] px-2 py-0.5 rounded"
              style={{ background: 'var(--bg-5)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
            >
              #{tag}
            </span>
          ))}
          {result.fix_confirmed && (
            <span
              className="font-mono text-[8px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded ml-auto"
              style={{ background: 'var(--success-dim)', border: '1px solid var(--success-border)', color: 'var(--success)' }}
            >
              ✓ fix confirmed
            </span>
          )}
          {result.resolution_status && result.resolution_status !== 'open' && !result.fix_confirmed && (
            <span
              className="font-mono text-[8px] font-semibold px-1.5 py-0.5 rounded ml-auto"
              style={{
                background: result.resolution_status === 'confirmed' ? 'var(--success-dim)' : 'var(--accent-dim)',
                border:     result.resolution_status === 'confirmed' ? '1px solid var(--success-border)' : '1px solid var(--accent-mid)',
                color:      result.resolution_status === 'confirmed' ? 'var(--success)' : 'var(--accent)',
              }}
            >
              {result.resolution_status}
            </span>
          )}
        </div>
      )}

      {/* ── Resolution snippet / fix ── */}
      {result.fix && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div
            className="flex items-center justify-between px-5 py-2"
            style={{ background: 'rgba(0,0,0,0.16)' }}
          >
            <span className="font-mono text-[8.5px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>
              Resolution Snippet
            </span>
            <button
              className="font-mono text-[11px] px-1.5 py-0.5 rounded opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-dim)' }}
              onClick={() => navigator.clipboard?.writeText(result.fix)}
              title="Copy"
            >
              ⧉
            </button>
          </div>
          <div
            className="px-5 py-3 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap"
            style={{ background: 'rgba(0,0,0,0.20)', color: 'var(--text-mid)', wordBreak: 'break-all' }}
          >
            {result.fix}
          </div>
        </div>
      )}

      {/* ── Resolve button ── */}
      {result.incident_id && result.resolution_status === 'open' && (
        <ResolveButton incidentId={result.incident_id} />
      )}
    </div>
  )
}

function ResolveButton({ incidentId }) {
  const [open,    setOpen]    = useState(false)
  const [fix,     setFix]     = useState('')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleResolve() {
    if (!fix.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/incidents/${incidentId}/resolve`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ resolution_status: 'confirmed', confirmed_fix: fix.trim(), resolved_by: 'ui' }),
      })
      if (res.ok) { setDone(true); setOpen(false) }
      else { setError(`Failed to resolve — server returned ${res.status}`) }
    } catch (e) { console.error(e); setError('Failed to resolve — network error') }
    finally { setLoading(false) }
  }

  if (done) return (
    <div className="px-5 py-3 font-mono text-[11px]" style={{ color: 'var(--success)', borderTop: '1px solid var(--border)' }}>
      ✓ Marked as resolved
    </div>
  )

  return (
    <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="font-mono text-[11px] px-3 py-1.5 rounded border transition-all duration-150"
          style={{ borderColor: 'var(--border)', color: 'var(--text-dim)', background: 'var(--bg-4)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
        >
          ✓ Mark Resolved
        </button>
      ) : (
        <div className="space-y-2">
          <textarea
            value={fix}
            onChange={e => setFix(e.target.value)}
            placeholder="What fixed it? (required)"
            rows={2}
            className="w-full font-mono text-[12px] px-3 py-2 rounded-md border resize-none outline-none transition-colors duration-150"
            style={{ background: 'var(--bg-4)', borderColor: 'var(--border)', color: 'var(--text-bright)' }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={e  => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          <div className="flex gap-2">
            <button
              onClick={handleResolve}
              disabled={loading || !fix.trim()}
              className="font-mono text-[11px] px-3 py-1.5 rounded border"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-dim)', opacity: loading || !fix.trim() ? 0.45 : 1 }}
            >
              {loading ? 'Saving…' : 'Save Fix'}
            </button>
            <button
              onClick={() => { setOpen(false); setError('') }}
              className="font-mono text-[11px] px-3 py-1.5 rounded border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="font-mono text-[10px]" style={{ color: 'var(--error, #EF4444)', marginTop: '4px' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
