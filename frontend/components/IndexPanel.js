'use client'

import { useState, useRef } from 'react'
import { DatabaseIcon, UploadIcon, CheckIcon, AlertIcon } from '@/components/Icons'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── Reusable card shell ────────────────────────────────────────────────────
function Card({ children }) {
  return (
    <div
      className="rounded-xl p-5 border"
      style={{ background: 'var(--bg-3)', borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  )
}

// ── Result banner ──────────────────────────────────────────────────────────
function ResultBanner({ result }) {
  if (!result) return null
  return (
    <div
      className="flex items-start gap-2.5 mt-4 px-4 py-3 rounded-lg font-mono text-xs"
      style={
        result.ok
          ? { background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)', color: 'var(--accent)' }
          : { background: 'var(--red-dim)',    border: '1px solid var(--red-border)',  color: 'var(--red)'    }
      }
    >
      <span className="flex-shrink-0 mt-px">
        {result.ok
          ? <CheckIcon className="w-3.5 h-3.5" />
          : <AlertIcon className="w-3.5 h-3.5" />}
      </span>
      <span>{result.msg}</span>
    </div>
  )
}

export default function IndexPanel() {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const fileRef               = useRef()

  async function indexDefault() {
    setLoading(true)
    setResult(null)
    try {
      const res  = await fetch(`${API}/index/default`, { method: 'POST' })
      const data = await res.json()
      setResult({ ok: true, msg: `Indexed ${data.indexed} sample incidents successfully.` })
    } catch (e) {
      setResult({ ok: false, msg: `Error: ${e.message}` })
    } finally {
      setLoading(false)
    }
  }

  async function indexFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch(`${API}/index/file`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      setResult({ ok: true, msg: `Indexed ${data.indexed} incidents from ${file.name}.` })
    } catch (e) {
      setResult({ ok: false, msg: `Error: ${e.message}` })
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="max-w-xl">
      {/* ── Section header ── */}
      <div className="flex items-center gap-2 mb-6">
        <DatabaseIcon className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
        <span
          className="font-mono text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--text-dim)' }}
        >
          Index Incidents
        </span>
      </div>

      <div className="flex flex-col gap-3">

        {/* ── Sample dataset ── */}
        <Card>
          <div
            className="text-sm font-semibold mb-1.5"
            style={{ color: 'var(--text-bright)' }}
          >
            Load Sample Dataset
          </div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-dim)' }}>
            45 pre-built production incidents across five failure clusters: connection pool
            exhaustion, gRPC deadline cascades, retry storms, queue backlogs, and OOM/memory
            pressure. Good for demo and testing.
          </p>
          <button
            onClick={indexDefault}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-md font-mono text-xs font-semibold tracking-wide transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#00e0b4' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
          >
            <DatabaseIcon className="w-3.5 h-3.5" />
            {loading ? 'Indexing…' : 'Index Sample Data'}
          </button>
        </Card>

        {/* ── File upload ── */}
        <Card>
          <div
            className="text-sm font-semibold mb-1.5"
            style={{ color: 'var(--text-bright)' }}
          >
            Upload Your Incidents
          </div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-dim)' }}>
            Upload a JSON file (array of incident objects). Required field:{' '}
            <code
              className="font-mono px-1 py-0.5 rounded"
              style={{ background: 'var(--bg-5)', color: 'var(--text-mid)', fontSize: '11px' }}
            >
              title
            </code>
            . All other fields (service, severity, error_message, root_cause, fix, etc.) are optional.
          </p>

          {/* Drop zone */}
          <div
            className="rounded-lg border border-dashed px-4 py-5 text-center cursor-pointer transition-colors duration-150 mb-0"
            style={{ borderColor: 'var(--border-bright)' }}
            onClick={() => fileRef.current?.click()}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-bright)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <UploadIcon className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
            <p className="font-mono text-[11px] mb-0.5" style={{ color: 'var(--text-mid)' }}>
              Click to select a JSON file
            </p>
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
              .json · array of incident objects
            </p>
          </div>

          <input
            type="file"
            accept=".json"
            ref={fileRef}
            className="file-input-hidden"
            onChange={indexFile}
            disabled={loading}
          />
        </Card>
      </div>

      <ResultBanner result={result} />
    </div>
  )
}
