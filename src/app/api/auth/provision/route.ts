import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import { users, foremen } from '@/lib/schema'

/**
 * POST /api/auth/provision
 * Zoho webhook: when a record is created in Portal_Users, create a Supabase Auth user
 * with a temporary password and optionally add them to users + foremen tables.
 * User is created with force_password_change: true so they are redirected to /update-password on first login.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.ZOHO_WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type') ?? ''
    let body: Record<string, unknown>
    if (contentType.includes('application/json')) {
      body = await request.json().catch(() => ({}))
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      body = {
        email: form.get('email'),
        tempPassword: form.get('tempPassword'),
        zohoId: form.get('zohoId'),
        name: form.get('name'),
      }
    } else {
      body = await request.json().catch(() => ({}))
    }
    const email = body.email != null ? String(body.email) : ''
    const tempPassword = body.tempPassword != null ? String(body.tempPassword) : ''
    const zohoId = body.zohoId != null ? String(body.zohoId) : ''
    const name = body.name != null ? String(body.name) : ''

    if (!email || !tempPassword || !zohoId) {
      return NextResponse.json({ error: 'Missing required fields (email, tempPassword, zohoId)' }, { status: 400 })
    }

    const supabase = createAdminClient()
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
    }

    const displayName = (name || email).trim()
    const zohoIdStr = String(zohoId)
    const emailTrimmed = String(email).trim()

    // Create Supabase Auth user with temp password; force password change on first login
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: emailTrimmed,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        force_password_change: true,
        zoho_id: zohoIdStr,
        name: displayName,
      },
    })

    if (authError) {
      console.error('[Provision] createUser error:', authError)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Upsert into users table (for reference / zoho mapping)
    try {
      await db.insert(users).values({
        email: emailTrimmed,
        zohoId: zohoIdStr,
        username: emailTrimmed,
        password: '',
        name: displayName,
      }).onConflictDoUpdate({
        target: users.email,
        set: { zohoId: zohoIdStr, username: emailTrimmed, name: displayName },
      })
    } catch (dbErr: any) {
      console.error('[Provision] users table write failed:', dbErr?.message || dbErr)
    }

    // Upsert into foremen so they appear in Select Foreman list
    try {
      await db.insert(foremen).values({
        zohoId: zohoIdStr,
        email: emailTrimmed,
        name: displayName,
        phone: null,
      }).onConflictDoUpdate({
        target: foremen.zohoId,
        set: { email: emailTrimmed, name: displayName, updatedAt: new Date().toISOString() },
      })
    } catch (dbErr: any) {
      console.error('[Provision] foremen table write failed:', dbErr?.message || dbErr)
    }

    return NextResponse.json({
      success: true,
      userId: authData.user?.id,
      message: 'User created. They will be required to set a new password on first login.',
    })
  } catch (error) {
    console.error('[Provision] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
