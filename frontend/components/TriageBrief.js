'use client'

import { ShieldIcon } from '@/components/Icons'

export default function TriageBrief({ brief, loading, searched }) {
  return (
    <div className="flex flex-col h-full">

      {/* Panel header */}
      <div
        className="flex items-center gap-2.5 px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <ShieldIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-bright)' }}>
          AI Triage Brief
        </span>
        <span
          className="font-mono text-[8px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded ml-auto"
          style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)', color: 'var(--accent)' }}
        >
          AI
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2.5 px-5 py-6">
          <div className="animate-pulse-dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>analyzing…</span>
        </div>
      )}

      {/* Pre-search placeholder */}
      {!loading && !searched && (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <Placeholder />
        </div>
      )}

      {/* No brief returned */}
      {!loading && searched && !brief && (
        <div className="flex-1 flex items-center justify-center px-5">
          <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
            No triage brief generated for this query.
          </p>
        </div>
      )}

      {/* Real brief */}
      {!loading && brief && (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <BriefContent brief={brief} />
        </div>
      )}
    </div>
  )
}

/* ── Placeholder ── */
function Placeholder() {
  return (
    <div className="flex flex-col gap-5 py-2">
      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
        Run a search to generate an AI triage brief grounded in your historical incidents.
      </p>
      <div className="space-y-3">
        {[
          { label: 'Failure Family',        desc: 'What category of failure this matches' },
          { label: 'Likely Cause',          desc: 'Most probable root cause from past incidents' },
          { label: 'First Response Checks', desc: 'Action items sourced from resolved incidents' },
          { label: 'Known Fix Pattern',     desc: 'Confirmed fixes from your incident history' },
        ].map(({ label, desc }) => (
          <div key={label} className="rounded-md px-3 py-2.5 border" style={{ background: 'var(--bg-3)', borderColor: 'var(--border)' }}>
            <p className="font-mono text-[9px] tracking-widest uppercase mb-1" style={{ color: 'var(--text-faint)' }}>{label}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>{desc}</p>
          </div>
        ))}
      </div>
      <p className="font-mono text-[9px]" style={{ color: 'var(--text-faint)' }}>
        Requires ANTHROPIC_API_KEY. Grounded in retrieved incidents only — no hallucination.
      </p>
    </div>
  )
}

/* ── Real brief content ── */
function BriefContent({ brief }) {
  const { failure_family, likely_cause, first_response_checks, known_fix_pattern, confidence_note } = brief

  return (
    <div className="space-y-5">
      {failure_family && (
        <Section label="Failure Family">
          <div className="flex flex-wrap gap-2">
            {failure_family.split(/[,\/]/).map(f => f.trim()).filter(Boolean).map(f => (
              <span
                key={f}
                className="font-mono text-[9px] px-2.5 py-1 rounded"
                style={{ background: 'var(--bg-4)', border: '1px solid var(--border-bright)', color: 'var(--text-dim)' }}
              >
                {f}
              </span>
            ))}
          </div>
        </Section>
      )}

      {likely_cause && (
        <Section label="Likely Cause">
          <p className="text-[12.5px] leading-relaxed font-medium" style={{ color: 'var(--text-bright)' }}>
            {likely_cause}
          </p>
        </Section>
      )}

      {Array.isArray(first_response_checks) && first_response_checks.length > 0 && (
        <Section label="First Response Checks">
          <ol className="space-y-2.5">
            {first_response_checks.map((check, i) => (
              <CheckItem key={i} done={false}>{check}</CheckItem>
            ))}
          </ol>
        </Section>
      )}

      {known_fix_pattern && (
        <Section label="Known Fix Pattern">
          <blockquote
            className="text-[11.5px] leading-relaxed italic px-3 py-2.5 rounded"
            style={{ background: 'var(--bg-4)', borderLeft: '2px solid var(--accent)', color: 'var(--text-dim)' }}
          >
            "{known_fix_pattern}"
          </blockquote>
        </Section>
      )}

      {confidence_note && (
        <Section label="Confidence">
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            {confidence_note}
          </p>
        </Section>
      )}
    </div>
  )
}

/* ── Helpers ── */
function Section({ label, children }) {
  return (
    <div>
      <span className="triage-section-label">{label}</span>
      {children}
    </div>
  )
}

function CheckItem({ children, done }) {
  return (
    <li className="flex items-start gap-2.5">
      <div
        className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center mt-0.5"
        style={{
          borderColor: done ? 'var(--accent)' : 'var(--border-bright)',
          background:  done ? 'var(--accent-dim)' : 'transparent',
        }}
      >
        {done && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3.5 6L6.5 2" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span className="text-[12px] leading-snug" style={{ color: done ? 'var(--text)' : 'var(--text-mid)' }}>
        {children}
      </span>
    </li>
  )
}
