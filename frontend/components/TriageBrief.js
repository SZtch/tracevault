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
    <div className="space-y-5">
      {/* Bubble */}
      <div
        className="rounded-lg px-4 py-3.5 text-xs leading-relaxed"
        style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
      >
        I've analyzed the pasted trace. This appears to be a{' '}
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Resource Starvation</span>{' '}
        issue affecting downstream IO.
      </div>

      <Section label="Failure Family">
        <div className="flex flex-wrap gap-2">
          {['Infrastructure', 'Network Latency'].map(t => (
            <span
              key={t}
              className="font-mono text-[9px] px-2.5 py-1 rounded"
              style={{ background: 'var(--bg-4)', border: '1px solid var(--border-bright)', color: 'var(--text-dim)' }}
            >
              {t}
            </span>
          ))}
        </div>
      </Section>

      <Section label="Likely Cause">
        <p className="text-[12.5px] leading-relaxed font-medium" style={{ color: 'var(--text-bright)' }}>
          Upstream TCP keep-alive settings mismatch following the latest{' '}
          <span className="font-mono text-[11px]" style={{ color: 'var(--accent)' }}>v2.4.1</span>{' '}
          deployment.
        </p>
      </Section>

      <Section label="First Response Checks">
        <ol className="space-y-2.5">
          {[
            { text: 'Verify Redis replica health in US-EAST-1', done: true },
            { text: 'Check VPC flow logs for packet drops',      done: false },
            { text: 'Audit security group egress rules',          done: false },
          ].map((item, i) => (
            <CheckItem key={i} done={item.done}>{item.text}</CheckItem>
          ))}
        </ol>
      </Section>

      <Section label="Known Fix Pattern">
        <blockquote
          className="text-[11.5px] leading-relaxed italic px-3 py-2.5 rounded"
          style={{ background: 'var(--bg-4)', borderLeft: '2px solid var(--accent)', color: 'var(--text-dim)' }}
        >
          "Apply the persistent-connection patch from incident #882."
        </blockquote>
        <button
          className="mt-2 flex items-center gap-1 font-mono text-[9px] font-semibold transition-opacity hover:opacity-80"
          style={{ color: 'var(--accent)' }}
        >
          Open Knowledge Base ↗
        </button>
      </Section>

      {/* Cluster viz */}
      <Section label="Cluster Visualization">
        <div
          className="rounded-lg overflow-hidden relative mb-2"
          style={{ height: '88px', background: 'linear-gradient(135deg, var(--bg-4) 0%, #061018 100%)', border: '1px solid var(--border)' }}
        >
          {[[28,42],[54,22],[72,55],[44,68],[81,28],[18,72]].map(([x,y], i) => (
            <div
              key={i}
              style={{
                position:     'absolute',
                left:         `${x}%`,
                top:          `${y}%`,
                width:        i < 2 ? '6px' : '4px',
                height:       i < 2 ? '6px' : '4px',
                borderRadius: '50%',
                background:   i === 0 ? 'var(--accent)' : i < 3 ? 'var(--text-dim)' : 'var(--border-bright)',
                boxShadow:    i === 0 ? '0 0 8px var(--accent-glow)' : 'none',
              }}
            />
          ))}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.3 }}>
            <line x1="28%" y1="42%" x2="54%" y2="22%" stroke="var(--border-bright)" strokeWidth="1" />
            <line x1="54%" y1="22%" x2="72%" y2="55%" stroke="var(--border-bright)" strokeWidth="1" />
            <line x1="28%" y1="42%" x2="44%" y2="68%" stroke="var(--border-bright)" strokeWidth="1" />
            <line x1="72%" y1="55%" x2="81%" y2="28%" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3,2" />
          </svg>
        </div>
        <p className="font-mono text-[9px]" style={{ color: 'var(--text-faint)' }}>
          Node health across 4 global regions.
        </p>
      </Section>
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
