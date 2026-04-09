import './globals.css'

export const metadata = {
  title: 'TraceVault',
  description: 'Incident similarity search — find past failures, root causes, and fixes fast.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
