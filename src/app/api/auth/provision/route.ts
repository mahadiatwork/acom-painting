import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    // 1. Security Check
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email, tempPassword, zohoId, name } = body

    if (!email || !tempPassword || !zohoId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 2. Check if user exists (optional, but good for idempotency)
    // Admin API allows listUsers, but creating with same email usually throws or returns existing.
    // We'll attempt create directly.

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm since Zoho verified it
      user_metadata: {
        force_password_change: true,
        zoho_id: zohoId,
        name: name || 'New User'
      }
    })

    if (error) {
      console.error('Provisioning Error:', error)
      // If user already exists, we might want to update metadata instead
      // For now, return error to Zoho so it can log it
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true, 
      userId: data.user.id 
    })

  } catch (error) {
    console.error('Provisioning Server Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

