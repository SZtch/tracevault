'use client'

import { useEffect, useState } from 'react'
import { ActivityIcon } from '@/components/Icons'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function StatusBar() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    async function check() {
      try {
        const res  = await fetch(`${API}/health`)
        const data = await res.json()
        setStatus(data)
      } catch {
        setStatus({ connected: false })
      }
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  const online  = status?.connected === true
  const pending = status === null

  return (
    <div className="font-mono text-[10px]">
      {/* Connection status row */}
      <div className="flex items-center gap-2 mb-1">
        <ActivityIcon
          className="w-3 h-3 flex-shrink-0"
          style={{ color: pending ? 'var(--text-dim)' : online ? 'var(--accent)' : 'var(--red)' }}
        />
        <span style={{ color: pending ? 'var(--text-dim)' : online ? 'var(--accent)' : 'var(--red)' }}>
          {pending ? 'Connecting…' : online ? 'VectorAI online' : 'DB offline'}
        </span>
      </div>

      {/* Incident count */}
      {online && status?.points_count != null && (
        <div
          className="pl-5 text-[9px] tracking-wide"
          style={{ color: 'var(--text-dim)' }}
        >
          {status.points_count.toLocaleString()} incident{status.points_count !== 1 ? 's' : ''} indexed
        </div>
      )}

      {/* No data hint */}
      {online && !status?.collection_exists && (
        <div className="pl-5 text-[9px]" style={{ color: 'var(--text-dim)' }}>
          No data — use Index tab
        </div>
      )}

      {/* Error detail */}
      {!pending && !online && status?.error && (
        <div
          className="pl-5 text-[9px] leading-relaxed mt-0.5"
          style={{ color: 'var(--red)', opacity: 0.7 }}
        >
          {status.error.slice(0, 55)}
        </div>
      )}
    </div>
  )
}
