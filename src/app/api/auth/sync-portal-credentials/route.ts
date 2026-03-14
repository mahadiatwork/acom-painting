import { NextRequest, NextResponse } from 'next/server'
import { syncPortalCredentialsFromZoho } from '@/lib/sync-portal-credentials'

/**
 * GET /api/auth/sync-portal-credentials
 * Fetches portal_user_email and portal_user_login from Zoho CRM org variables,
 * then ensures a single Supabase Auth user exists with that email and password.
 * Call via cron or manually after changing the variables in Zoho.
 * Secured by ZOHO_WEBHOOK_SECRET in Authorization header.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const secret = process.env.ZOHO_WEBHOOK_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await syncPortalCredentialsFromZoho()

    if (!result.success) {
      const status = result.error.includes('Missing') ? 500 : result.error.includes('Could not read') ? 502 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      email: result.email,
      ...(result.userId && { userId: result.userId }),
    })
  } catch (error) {
    console.error('[Sync Portal Credentials] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
