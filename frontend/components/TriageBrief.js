'use client'

import { ShieldIcon } from '@/components/Icons'

/**
 * TriageBrief — hero operational summary above search results.
 * Display only. No user interaction.
 */
export default function TriageBrief({ brief }) {
  if (!brief) return null

  const {
    failure_family,
    likely_cause,
    first_response_checks,
    known_fix_pattern,
    confidence_note,
  } = brief

  return (
    <div
      className="mb-6 rounded-xl animate-fade-in overflow-hidden"
      style={{
        background:  'var(--bg-3)',
        border:      '1px solid var(--accent-mid)',
        borderLeft:  '3px solid var(--accent)',
        boxShadow:   '0 1px 16px rgba(0, 0, 0, 0.35)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-6 py-4 border-b"
        style={{
          background:  'var(--bg-4)',
          borderColor: 'rgba(79, 140, 255, 0.14)',
        }}
      >
        <ShieldIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
        <span
          className="text-sm font-semibold tracking-tight"
          style={{ color: 'var(--text-bright)', fontFamily: 'var(--sans)' }}
        >
          Triage Brief
        </span>
        <span
          className="font-mono text-[9px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded"
          style={{
            background:  'var(--accent-dim)',
            border:      '1px solid var(--accent-mid)',
            color:       'var(--accent)',
          }}
        >
          AI
        </span>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-dim)', fontFamily: 'var(--sans)' }}>
          Grounded in retrieved incidents
        </span>
      </div>

      {/* ── Failure family + Likely cause ── */}
      <div className="px-6 pt-5 pb-5 grid sm:grid-cols-2 gap-6">
        <BriefField label="Failure Family" value={failure_family} />
        <BriefField label="Likely Cause"   value={likely_cause}   highlight />
      </div>

      {/* ── Check First — most scannable section ── */}
      {Array.isArray(first_response_checks) && first_response_checks.length > 0 && (
        <>
          <hr className="brief-divider" />
          <div
            className="px-6 py-5"
            style={{ background: 'rgba(79, 140, 255, 0.025)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span
                className="font-mono text-[10px] font-semibold tracking-widest uppercase"
                style={{ color: 'var(--accent)' }}
              >
                Check First
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(79, 140, 255, 0.15)' }} />
            </div>
            <ol className="space-y-3">
              {first_response_checks.map((check, i) => (
                <li key={i} className="flex items-start gap-3.5">
                  <span
                    className="flex-shrink-0 font-mono text-[11px] font-bold tabular-nums mt-0.5 w-5 text-right leading-tight"
                    style={{ color: 'var(--accent)' }}
                  >
                    {i + 1}.
                  </span>
                  <span
                    className="text-[14px] font-medium leading-snug"
                    style={{ color: 'var(--text-bright)', fontFamily: 'var(--sans)' }}
                  >
                    {check}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {/* ── Known fix pattern ── */}
      {known_fix_pattern && (
        <>
          <hr className="brief-divider" />
          <div className="px-6 py-5">
            <BriefField label="Known Fix Pattern" value={known_fix_pattern} />
          </div>
        </>
      )}

      {/* ── Confidence note — footer ── */}
      {confidence_note && (
        <>
          <hr className="brief-divider" />
          <div
            className="px-6 py-3 flex items-start gap-3"
            style={{ background: 'rgba(0, 0, 0, 0.18)' }}
          >
            <span
              className="flex-shrink-0 font-mono text-[9px] font-semibold tracking-widest uppercase mt-0.5"
              style={{ color: 'var(--text-faint)' }}
            >
              Confidence
            </span>
            <span className="text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)', fontFamily: 'var(--sans)' }}>
              {confidence_note}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FieldLabel({ children }) {
  return (
    <span
      className="font-mono text-[9px] font-semibold tracking-widest uppercase block"
      style={{ color: 'var(--text-dim)' }}
    >
      {children}
    </span>
  )
}

function BriefField({ label, value, highlight = false }) {
  if (!value) return null
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p
        className="text-[14px] leading-relaxed mt-2 font-medium"
        style={{
          color:      highlight ? 'var(--text-bright)' : 'var(--text)',
          fontFamily: 'var(--sans)',
          fontWeight: highlight ? 500 : 400,
        }}
      >
        {value}
      </p>
    </div>
  )
}
