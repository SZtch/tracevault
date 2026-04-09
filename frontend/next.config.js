/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel deployment: NEXT_PUBLIC_API_URL must be set in Vercel environment variables.
  // Local dev: falls back to http://localhost:8000 (set in each component).
  // No rewrites needed — backend is on a separate Railway domain (CORS handles it).

  // Fail build loudly if NEXT_PUBLIC_API_URL is missing in production.
  // Prevents deploying to Vercel without configuring the backend URL.
  ...(process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL
    ? (() => { throw new Error("NEXT_PUBLIC_API_URL is not set. Add it in Vercel → Settings → Environment Variables.") })()
    : {}),
}

module.exports = nextConfig
