'use client'

import { useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function StatusBar() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    async function check() {
      try {
        const res  = await fetch(`${API}/health`)
        const data = await res.json()
        setStatus(data)
      } catch { setStatus({ connected: false }) }
    }
    check()
    const iv = setInterval(check, 10000)
    return () => clearInterval(iv)
  }, [])

  const online  = status?.connected === true
  const pending = status === null

  const dotColor = pending ? 'var(--text-faint)' : online ? 'var(--success)' : 'var(--danger)'
  const dotAnim  = online ? 'animate-status' : ''

  return (
    <div className="font-mono text-[10px]">
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotAnim}`}
          style={{ background: dotColor }}
        />
        <span style={{ color: dotColor }}>
          {pending ? 'Connecting…' : online ? 'VectorAI online' : 'DB offline'}
        </span>
      </div>
      {online && status?.incident_count != null && (
        <div className="pl-3.5 text-[9px] tracking-wide" style={{ color: 'var(--text-faint)' }}>
          {status.incident_count.toLocaleString()} incident{status.incident_count !== 1 ? 's' : ''} indexed
        </div>
      )}
      {online && status?.embedding_model && !status.embedding_model.startsWith('all-MiniLM') && (
        <div className="pl-3.5 text-[9px] mt-0.5" style={{ color: 'var(--warning)', opacity: 0.8 }} title={status.embedding_model}>
          ⚠ embedding degraded
        </div>
      )}
      {!pending && !online && status?.error && (
        <div className="pl-3.5 text-[9px] leading-relaxed mt-0.5" style={{ color: 'var(--danger)', opacity: 0.65 }}>
          {status.error.slice(0, 55)}
        </div>
      )}
    </div>
  )
}
