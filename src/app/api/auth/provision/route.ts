import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/provision
 * Legacy Zoho webhook: per-foreman user provisioning is disabled.
 * Authentication now uses a single shared login from Zoho CRM org variables
 * (portal_user_email, portal_user_login). Foremen are listed from the users table
 * synced by cron (Portal_Users from Zoho); no Supabase Auth user is created per foreman.
 * This route returns success so existing Zoho workflows that call it do not break.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.ZOHO_WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      message: 'Provisioning disabled. Portal login uses Zoho org variables (portal_user_email, portal_user_login). Sync shared credentials via GET /api/auth/sync-portal-credentials.',
    })
  } catch (error) {
    console.error('Provisioning Server Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
