'use client'

import { useState } from 'react'
import { LayersIcon, WrenchIcon, TerminalIcon, TagIcon } from '@/components/Icons'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Signal → human label
const PRIMARY_SIGNAL_LABEL = {
  exception_class: 'exception match',
  error_message:   'error match',
  service_failure: 'service + failure mode',
  failure_mode:    'failure mode match',
  title:           'title overlap',
  semantic:        'semantic similarity',
}

// ── Section label with icon ───────────────────────────────────────────────
function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
      <span
        className="font-mono text-[9px] font-semibold tracking-widest uppercase"
        style={{ color: 'var(--text-dim)' }}
      >
        {children}
      </span>
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────
function Divider() {
  return <div className="my-3" style={{ borderTop: '1px solid var(--border)', opacity: 0.6 }} />
}

export default function ResultCard({ result, rank }) {
  const score  = result.score
  const isTop  = rank === 1

  // Qualitative label + color
  const { label: similarityLabel, color: scoreColor } =
    score >= 0.90 ? { label: 'strong match',  color: 'var(--accent)'  } :
    score >= 0.75 ? { label: 'good match',    color: 'var(--accent)'  } :
    score >= 0.55 ? { label: 'partial match', color: 'var(--yellow)'  } :
                   { label: 'weak match',     color: 'var(--text-dim)'}

  const failureMode   = result.failure_mode || result.match_signals?.failure_mode || ''
  const matchReason   = result.match_reason || ''
  const contextHints  = result.context_hints?.filter(Boolean) ?? []
  const primarySignal = result.primary_signal || 'semantic'
  const showReason    = matchReason && matchReason !== failureMode

  const sevClass = `sev-${result.severity}`

  return (
    <div
      className={`result-card animate-slide-up rounded-xl mb-3 border-l-2 transition-colors duration-150 ${sevClass}`}
      style={{
        background:  'var(--bg-3)',
        border:      '1px solid var(--border)',
        padding:     '18px 20px',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderRightColor = 'var(--border-bright)'; e.currentTarget.style.borderTopColor = 'var(--border-bright)'; e.currentTarget.style.borderBottomColor = 'var(--border-bright)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderRightColor = 'var(--border)'; e.currentTarget.style.borderTopColor = 'var(--border)'; e.currentTarget.style.borderBottomColor = 'var(--border)'; }}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 mb-3">
        {/* Left meta: rank / best-match / id / severity / service */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
            #{rank}
          </span>

          {isTop && (
            <span
              className="font-mono text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
              style={{
                background:  'var(--accent-dim)',
                border:      '1px solid var(--accent-mid)',
                color:       'var(--accent)',
              }}
            >
              best match
            </span>
          )}

          <span
            className="font-mono text-[10px] px-2 py-0.5 rounded"
            style={{
              background:  'var(--bg-5)',
              border:      '1px solid var(--border)',
              color:       'var(--text-dim)',
            }}
          >
            {result.incident_id}
          </span>

          {result.severity && (
            <span
              className={`badge-${result.severity} font-mono text-[9px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded`}
            >
              {result.severity}
            </span>
          )}

          {result.service && (
            <span
              className="font-mono text-[10px] px-2 py-0.5 rounded"
              style={{
                background:  'rgba(64,144,208,0.10)',
                border:      '1px solid rgba(64,144,208,0.22)',
                color:       'var(--blue)',
              }}
            >
              {result.service}
            </span>
          )}
        </div>

        {/* Right: similarity score */}
        <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
          <span
            className="font-mono text-[10px] font-semibold"
            style={{ color: scoreColor }}
          >
            {similarityLabel}
          </span>
          <span
            className="font-mono text-[11px] font-bold tabular-nums"
            style={{ color: scoreColor }}
          >
            {score.toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── Title ── */}
      <div
        className="text-[15px] font-semibold leading-snug mb-3"
        style={{ color: 'var(--text-bright)' }}
      >
        {result.title}
      </div>

      {/* ── Failure mode badge ── */}
      {failureMode && (
        <div
          className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium px-2.5 py-1 rounded mb-3"
          style={{
            background:  'var(--accent-dim)',
            border:      '1px solid var(--accent-mid)',
            color:       'var(--accent)',
          }}
        >
          <span style={{ fontSize: '8px', opacity: 0.7 }}>◈</span>
          {failureMode}
        </div>
      )}

      {/* ── Error message ── */}
      {result.error_message && (
        <>
          <Divider />
          <SectionLabel icon={TerminalIcon}>Error</SectionLabel>
          <div
            className="font-mono text-[11px] leading-relaxed rounded-md px-3 py-2.5 break-all"
            style={{
              background:  'rgba(224,80,80,0.06)',
              border:      '1px solid var(--red-border)',
              color:       'var(--red)',
            }}
          >
            {result.error_message}
          </div>
        </>
      )}

      {/* ── Root cause ── */}
      {result.root_cause && (
        <>
          <Divider />
          <SectionLabel icon={LayersIcon}>Root Cause</SectionLabel>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>
            {result.root_cause}
          </p>
        </>
      )}

      {/* ── Fix applied ── */}
      {result.fix && (
        <>
          <Divider />
          <div className="flex items-center gap-2 mb-1.5">
            <WrenchIcon className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
            <span className="font-mono text-[9px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>
              Fix Applied
            </span>
            {result.fix_confirmed && (
              <span
                className="font-mono text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
                style={{
                  background:  'var(--accent-dim)',
                  border:      '1px solid var(--accent-mid)',
                  color:       'var(--accent)',
                }}
              >
                ✓ confirmed
              </span>
            )}
          </div>
          <div
            className="text-[13px] leading-relaxed rounded-md px-3 py-2.5"
            style={{
              background:  result.fix_confirmed ? 'rgba(0,200,160,0.08)' : 'rgba(0,200,160,0.05)',
              border:      result.fix_confirmed ? '1px solid rgba(0,200,160,0.28)' : '1px solid rgba(0,200,160,0.14)',
              color:       'var(--text)',
            }}
          >
            {result.fix}
          </div>
        </>
      )}

      {/* ── Why matched ── */}
      {(contextHints.length > 0 || showReason) && (
        <>
          <Divider />
          <div
            className="font-mono text-[9px] font-semibold tracking-widest uppercase mb-2"
            style={{ color: 'var(--text-dim)' }}
          >
            Why Matched
          </div>

          {/* Context hint chips */}
          {contextHints.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {contextHints.map(hint => (
                <span
                  key={hint}
                  className="font-mono text-[10px] px-2 py-0.5 rounded"
                  style={{
                    background:  'rgba(255,255,255,0.05)',
                    border:      '1px solid rgba(255,255,255,0.10)',
                    color:       'var(--text-mid)',
                  }}
                >
                  {hint}
                </span>
              ))}
            </div>
          )}

          {/* Fallback: primary signal chip when no context hints fired */}
          {contextHints.length === 0 && primarySignal !== 'semantic' && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span
                className="font-mono text-[10px] px-2 py-0.5 rounded"
                style={{
                  background:  'rgba(255,255,255,0.04)',
                  border:      '1px solid rgba(255,255,255,0.07)',
                  color:       'var(--text-dim)',
                }}
              >
                {PRIMARY_SIGNAL_LABEL[primarySignal] ?? primarySignal}
              </span>
            </div>
          )}

          {/* Match reason sentence */}
          {showReason && (
            <p className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--text-mid)' }}>
              {matchReason}
            </p>
          )}
        </>
      )}

      {/* ── Footer: tags + date + resolution status ── */}
      {(result.tags?.filter(Boolean).length > 0 || result.date || result.resolution_status) && (
        <>
          <Divider />
          <div className="flex items-center gap-2 flex-wrap">
            <TagIcon className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-dim)', opacity: 0.5 }} />
            {result.tags?.filter(Boolean).map(tag => (
              <span
                key={tag}
                className="font-mono text-[10px] px-2 py-0.5 rounded"
                style={{
                  background:  'var(--bg-5)',
                  border:      '1px solid var(--border)',
                  color:       'var(--text-dim)',
                }}
              >
                #{tag}
              </span>
            ))}
            {result.resolution_status && result.resolution_status !== 'open' && (
              <span
                className="font-mono text-[9px] px-2 py-0.5 rounded"
                style={{
                  background:  result.resolution_status === 'confirmed' ? 'rgba(64,144,208,0.10)' : 'var(--accent-dim)',
                  border:      result.resolution_status === 'confirmed' ? '1px solid rgba(64,144,208,0.25)' : '1px solid var(--accent-mid)',
                  color:       result.resolution_status === 'confirmed' ? '#4090d0' : 'var(--accent)',
                }}
              >
                {result.resolution_status}
                {result.resolved_by ? ` · ${result.resolved_by}` : ''}
              </span>
            )}
            {result.date && (
              <span
                className="font-mono text-[10px] ml-auto"
                style={{ color: 'var(--text-dim)', opacity: 0.6 }}
              >
                {result.date.split('T')[0]}
              </span>
            )}
          </div>
        </>
      )}

      {result.incident_id && result.resolution_status === "open" && (
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

  async function handleResolve() {
    if (!fix.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${API}/incidents/${incidentId}/resolve`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ resolution_status: 'confirmed', confirmed_fix: fix.trim(), resolved_by: 'ui' }),
      })
      if (res.ok) { setDone(true); setOpen(false) }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (done) return (
    <div className="mt-2 font-mono text-[10px]" style={{ color: 'var(--accent)' }}>
      ✓ Marked as resolved
    </div>
  )

  return (
    <div className="mt-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="font-mono text-[10px] px-2 py-1 rounded border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-dim)', background: 'var(--bg-4)' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
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
            className="w-full font-mono text-[11px] px-2 py-1.5 rounded border resize-none outline-none"
            style={{ background: 'var(--bg-4)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleResolve}
              disabled={loading || !fix.trim()}
              className="font-mono text-[10px] px-3 py-1 rounded border"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-dim)', opacity: loading || !fix.trim() ? 0.5 : 1 }}
            >
              {loading ? 'Saving…' : 'Save Fix'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="font-mono text-[10px] px-3 py-1 rounded border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
