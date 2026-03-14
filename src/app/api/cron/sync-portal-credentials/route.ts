import { NextRequest, NextResponse } from 'next/server'
import { syncPortalCredentialsFromZoho } from '@/lib/sync-portal-credentials'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/sync-portal-credentials
 * Cron endpoint: syncs the shared portal Supabase Auth user from Zoho CRM org variables
 * (portal_user_email, portal_user_login). Schedule this (e.g. daily) so credentials stay in sync.
 * Secured by ZOHO_WEBHOOK_SECRET in Authorization header.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const secret = process.env.ZOHO_WEBHOOK_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Cron] Syncing portal credentials from Zoho...')
    const result = await syncPortalCredentialsFromZoho()

    if (!result.success) {
      console.error('[Cron] Sync portal credentials failed:', result.error)
      const status = result.error.includes('Missing') ? 500 : result.error.includes('Could not read') ? 502 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    console.log('[Cron] Portal credentials synced:', result.email)
    return NextResponse.json({
      success: true,
      message: result.message,
      email: result.email,
      ...(result.userId && { userId: result.userId }),
    })
  } catch (error) {
    console.error('[Cron] Sync portal credentials error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
