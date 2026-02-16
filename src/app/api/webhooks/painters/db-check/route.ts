import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/webhooks/painters/db-check
 * Returns which database host the app uses (no secrets). Use this to verify
 * Vercel's DATABASE_URL points to the same Supabase project where you created the painters table.
 * Auth: same as webhook (Bearer ZOHO_WEBHOOK_SECRET).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const secret = authHeader?.replace('Bearer ', '') || request.headers.get('x-roofworx-secret')
  if (secret !== process.env.ZOHO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.DATABASE_URL || ''
  let databaseHost = '(DATABASE_URL not set)'
  try {
    if (url) {
      const match = url.match(/@([^/]+)(?:\/|$)/)
      databaseHost = match ? match[1] : url.replace(/^[^@]+@/, '').split('/')[0] || url.slice(0, 50)
    }
  } catch {
    databaseHost = '(could not parse)'
  }

  return NextResponse.json({
    message: 'Compare this host with Supabase: Project Settings → Database → Host',
    databaseHost,
    hint: 'If this does not match the Supabase project where you created the painters table, set DATABASE_URL in Vercel to that project\'s connection string (Session mode or Pooler).',
  })
}
