'use client'

import { ShieldIcon } from '@/components/Icons'

/**
 * TriageBrief — renders the structured brief returned by the /search endpoint.
 *
 * Constraints:
 * - Display only. No chat input. No user interaction beyond reading.
 * - Rendered above the result list when triage_brief is non-null.
 * - Matches the existing dark design system (CSS vars, font-mono, borders).
 * - If brief is null (API key missing or call failed), renders nothing —
 *   the result list continues to work normally.
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
      className="mb-5 rounded-xl animate-fade-in"
      style={{
        background:   'var(--bg-3)',
        border:       '1px solid var(--accent-mid)',
        borderLeft:   '3px solid var(--accent)',
        overflow:     'hidden',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 px-5 py-3 border-b"
        style={{
          background:   'var(--accent-dim)',
          borderColor:  'var(--accent-mid)',
        }}
      >
        <ShieldIcon
          className="w-3.5 h-3.5 flex-shrink-0"
          style={{ color: 'var(--accent)' }}
        />
        <span
          className="font-mono text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--accent)' }}
        >
          Triage Brief
        </span>
        <span
          className="font-mono text-[9px] tracking-wide ml-auto"
          style={{ color: 'var(--text-dim)' }}
        >
          Grounded in retrieved incidents only
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 grid gap-4">

        {/* Failure family + Likely cause — side by side on wider screens */}
        <div className="grid sm:grid-cols-2 gap-4">
          <BriefField
            label="Failure Family"
            value={failure_family}
          />
          <BriefField
            label="Likely Cause — Inspect First"
            value={likely_cause}
            highlight
          />
        </div>

        {/* First-response checks */}
        {Array.isArray(first_response_checks) && first_response_checks.length > 0 && (
          <div>
            <FieldLabel>First-Response Checks</FieldLabel>
            <ul className="mt-1.5 space-y-1.5">
              {first_response_checks.map((check, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 font-mono text-[11px] leading-relaxed"
                  style={{ color: 'var(--text)' }}
                >
                  <span
                    className="flex-shrink-0 mt-px font-semibold"
                    style={{ color: 'var(--accent)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {check}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Known fix pattern */}
        <BriefField
          label="Known Fix Pattern"
          value={known_fix_pattern}
        />

        {/* Confidence note */}
        <div
          className="flex items-start gap-2 px-3.5 py-2.5 rounded-md"
          style={{
            background:  'rgba(90, 112, 128, 0.10)',
            border:      '1px solid var(--border-bright)',
          }}
        >
          <span
            className="flex-shrink-0 font-mono text-[10px] tracking-widest uppercase mt-px"
            style={{ color: 'var(--text-dim)' }}
          >
            Confidence
          </span>
          <span
            className="font-mono text-[11px] leading-relaxed"
            style={{ color: 'var(--text-mid)' }}
          >
            {confidence_note}
          </span>
        </div>

      </div>
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
        className="font-mono text-[11px] leading-relaxed mt-1"
        style={{ color: highlight ? 'var(--text-bright)' : 'var(--text)' }}
      >
        {value}
      </p>
    </div>
  )
}
