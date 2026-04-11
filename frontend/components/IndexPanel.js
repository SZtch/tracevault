'use client'

import { useState, useRef } from 'react'
import { DatabaseIcon, UploadIcon, CheckIcon, AlertIcon, TrashIcon, EditIcon } from '@/components/Icons'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function Card({ children }) {
  return (
    <div className="rounded-xl p-5 border" style={{ background: 'var(--bg-3)', borderColor: 'var(--border)' }}>
      {children}
    </div>
  )
}

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
        {result.ok ? <CheckIcon className="w-3.5 h-3.5" /> : <AlertIcon className="w-3.5 h-3.5" />}
      </span>
      <span>{result.msg}</span>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, as = 'input' }) {
  const style = { background: 'var(--bg-4)', borderColor: 'var(--border)', color: 'var(--text)', width: '100%' }
  const cls = 'font-mono text-xs px-3 py-2 rounded border transition-colors duration-150 outline-none focus:border-[var(--accent)]'
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>{label}</span>
      {as === 'textarea'
        ? <textarea className={cls} style={{ ...style, minHeight: '72px', resize: 'vertical' }} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <input className={cls} style={style} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      }
    </div>
  )
}

export default function IndexPanel() {
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState(null)
  const fileRef                     = useRef()

  const [manageId,   setManageId]   = useState('')
  const [delResult,  setDelResult]  = useState(null)
  const [delLoading, setDelLoading] = useState(false)

  const [updId,        setUpdId]        = useState('')
  const [updRootCause, setUpdRootCause] = useState('')
  const [updFix,       setUpdFix]       = useState('')
  const [updSeverity,  setUpdSeverity]  = useState('')
  const [updTags,      setUpdTags]      = useState('')
  const [updResult,    setUpdResult]    = useState(null)
  const [updLoading,   setUpdLoading]   = useState(false)

  async function indexDefault() {
    setLoading(true); setResult(null)
    try {
      const res  = await fetch(`${API}/index/default`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Index failed')
      const skippedNote = data.skipped > 0 ? ` Skipped ${data.skipped} duplicate${data.skipped > 1 ? 's' : ''}.` : ''
      setResult({ ok: true, msg: `Indexed ${data.indexed} sample incidents.${skippedNote}` })
    } catch (e) { setResult({ ok: false, msg: `Error: ${e.message}` }) }
    finally { setLoading(false) }
  }

  async function indexFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true); setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch(`${API}/index/file`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      const skippedNote = data.skipped > 0 ? ` Skipped ${data.skipped} duplicate${data.skipped > 1 ? 's' : ''}.` : ''
      setResult({ ok: true, msg: `Indexed ${data.indexed} incidents from ${file.name}.${skippedNote}` })
    } catch (e) { setResult({ ok: false, msg: `Error: ${e.message}` }) }
    finally { setLoading(false); e.target.value = '' }
  }

  async function deleteIncident() {
    const id = manageId.trim()
    if (!id) return
    setDelLoading(true); setDelResult(null)
    try {
      const res  = await fetch(`${API}/incidents/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setDelResult({ ok: true, msg: `Incident '${id}' deleted from index.` })
      setManageId('')
    } catch (e) { setDelResult({ ok: false, msg: e.message }) }
    finally { setDelLoading(false) }
  }

  async function updateIncident() {
    const id = updId.trim()
    if (!id) return
    const body = {}
    if (updRootCause.trim()) body.root_cause = updRootCause.trim()
    if (updFix.trim())       body.fix        = updFix.trim()
    if (updSeverity)         body.severity   = updSeverity
    if (updTags.trim())      body.tags       = updTags.split(',').map(t => t.trim()).filter(Boolean)
    if (!Object.keys(body).length) {
      setUpdResult({ ok: false, msg: 'Fill in at least one field to update.' })
      return
    }
    setUpdLoading(true); setUpdResult(null)
    try {
      const res  = await fetch(`${API}/incidents/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setUpdResult({ ok: true, msg: `Updated ${data.updated_fields.join(', ')} on '${id}'. Re-embedded.` })
      setUpdId(''); setUpdRootCause(''); setUpdFix(''); setUpdSeverity(''); setUpdTags('')
    } catch (e) { setUpdResult({ ok: false, msg: e.message }) }
    finally { setUpdLoading(false) }
  }

  const btnBase = 'flex items-center gap-2 px-4 py-2 rounded-md font-mono text-xs font-semibold tracking-wide transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 mb-6">
        <DatabaseIcon className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
        <span className="font-mono text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>
          Index Incidents
        </span>
      </div>

      <div className="flex flex-col gap-3">

        {/* Sample dataset */}
        <Card>
          <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-bright)' }}>Load Sample Dataset</div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-dim)' }}>
            45 pre-built production incidents across five failure clusters: connection pool exhaustion,
            gRPC deadline cascades, retry storms, queue backlogs, and OOM/memory pressure.
          </p>
          <button onClick={indexDefault} disabled={loading} className={btnBase}
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#00e0b4' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
          >
            <DatabaseIcon className="w-3.5 h-3.5" />
            {loading ? 'Indexing…' : 'Index Sample Data'}
          </button>
        </Card>

        {/* File upload */}
        <Card>
          <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-bright)' }}>Upload Your Incidents</div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-dim)' }}>
            Upload a JSON file (array of incident objects). Required field:{' '}
            <code className="font-mono px-1 py-0.5 rounded" style={{ background: 'var(--bg-5)', color: 'var(--text-mid)', fontSize: '11px' }}>title</code>.
            All other fields optional.
          </p>
          <div
            className="rounded-lg border border-dashed px-4 py-5 text-center cursor-pointer transition-colors duration-150"
            style={{ borderColor: 'var(--border-bright)' }}
            onClick={() => fileRef.current?.click()}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-bright)'; e.currentTarget.style.background = 'transparent' }}
          >
            <UploadIcon className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
            <p className="font-mono text-[11px] mb-0.5" style={{ color: 'var(--text-mid)' }}>Click to select a JSON file</p>
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>.json · array of incident objects</p>
          </div>
          <input type="file" accept=".json" ref={fileRef} className="file-input-hidden" onChange={indexFile} disabled={loading} />
        </Card>

        <ResultBanner result={result} />

        {/* Divider */}
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>Manage</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* Delete */}
        <Card>
          <div className="flex items-center gap-2 mb-1.5">
            <TrashIcon className="w-3.5 h-3.5" style={{ color: 'var(--red)' }} />
            <div className="text-sm font-semibold" style={{ color: 'var(--text-bright)' }}>Delete Incident</div>
          </div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-dim)' }}>
            Remove an incident from the index by ID. Use to clean up duplicates or incorrectly indexed data.
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Field label="Incident ID" value={manageId} onChange={setManageId} placeholder="e.g. INC-001" />
            </div>
            <button
              onClick={deleteIncident}
              disabled={delLoading || !manageId.trim()}
              className={btnBase}
              style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-border)', flexShrink: 0 }}
            >
              <TrashIcon className="w-3.5 h-3.5" />
              {delLoading ? 'Deleting…' : 'Delete'}
            </button>
          </div>
          <ResultBanner result={delResult} />
        </Card>

        {/* Update */}
        <Card>
          <div className="flex items-center gap-2 mb-1.5">
            <EditIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <div className="text-sm font-semibold" style={{ color: 'var(--text-bright)' }}>Update Incident</div>
          </div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-dim)' }}>
            Add postmortem data or correct fields on an existing incident. Only filled fields are updated. Vector is re-embedded automatically.
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Incident ID" value={updId} onChange={setUpdId} placeholder="e.g. INC-001" />
            <Field label="Root Cause" value={updRootCause} onChange={setUpdRootCause} placeholder="What caused this incident?" as="textarea" />
            <Field label="Fix" value={updFix} onChange={setUpdFix} placeholder="What resolved it?" as="textarea" />
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>Severity</span>
                <select
                  value={updSeverity} onChange={e => setUpdSeverity(e.target.value)}
                  className="font-mono text-xs px-3 py-2 rounded border outline-none"
                  style={{ background: 'var(--bg-4)', borderColor: 'var(--border)', color: updSeverity ? 'var(--text)' : 'var(--text-dim)' }}
                >
                  <option value="">— unchanged —</option>
                  <option value="critical">critical</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </div>
              <div className="flex-1">
                <Field label="Tags (comma-separated)" value={updTags} onChange={setUpdTags} placeholder="kafka, timeout" />
              </div>
            </div>
            <button
              onClick={updateIncident} disabled={updLoading || !updId.trim()}
              className={btnBase}
              style={{ background: 'var(--accent)', color: 'var(--bg)', alignSelf: 'flex-start' }}
              onMouseEnter={e => { if (!updLoading && updId.trim()) e.currentTarget.style.background = '#00e0b4' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
            >
              <EditIcon className="w-3.5 h-3.5" />
              {updLoading ? 'Updating…' : 'Update Incident'}
            </button>
          </div>
          <ResultBanner result={updResult} />
        </Card>

      </div>
    </div>
  )
}
