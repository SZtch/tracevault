// Inline SVG icons — no external dependency, consistent 20×20 viewBox.
// Pass className for size/color via Tailwind (e.g. "w-4 h-4 text-accent").

export function SearchIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <line x1="12.5" y1="12.5" x2="17" y2="17" />
    </svg>
  )
}

export function DatabaseIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="10" cy="5" rx="7" ry="2.5" />
      <path d="M3 5v4c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5V5" />
      <path d="M3 9v4c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5V9" />
    </svg>
  )
}

export function ActivityIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,12 5,12 7,5 10,16 13,9 15,12 18,12" />
    </svg>
  )
}

export function AlertIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.27 3.07L1.5 15a2 2 0 001.73 3h13.54a2 2 0 001.73-3L11.73 3.07a2 2 0 00-3.46 0z" />
      <line x1="10" y1="9" x2="10" y2="12" />
      <circle cx="10" cy="15" r="0.5" fill="currentColor" />
    </svg>
  )
}

export function CheckIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4.5 4.5L16 6" />
    </svg>
  )
}

export function WrenchIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 3.3a4 4 0 00-5.4 5.4L3 15l2 2 6.3-6.3a4 4 0 005.4-5.4l-2.3 2.3-1.5-1.5 2.3-2.3z" />
    </svg>
  )
}

export function LayersIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10l8 4 8-4" />
      <path d="M2 14l8 4 8-4" />
      <path d="M2 6l8-4 8 4-8 4-8-4z" />
    </svg>
  )
}

export function ZapIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11,2 4,12 10,12 9,18 16,8 10,8 11,2" />
    </svg>
  )
}

export function TagIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 2.5L18 10a2 2 0 010 2.83l-4.17 4.17a2 2 0 01-2.83 0L3.5 9.5V5a2.5 2.5 0 012.5-2.5h4.5z" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TerminalIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,7 8,10 3,13" />
      <line x1="10" y1="13" x2="17" y2="13" />
    </svg>
  )
}

export function SparkleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" />
      <circle cx="10" cy="10" r="3" />
    </svg>
  )
}

export function UploadIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14v2a2 2 0 002 2h8a2 2 0 002-2v-2" />
      <polyline points="13,7 10,4 7,7" />
      <line x1="10" y1="4" x2="10" y2="13" />
    </svg>
  )
}
