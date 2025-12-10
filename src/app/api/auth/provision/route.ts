import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import { users } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { redis } from '@/lib/redis'

export async function POST(request: NextRequest) {
  try {
    // 1. Security Check
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.ZOHO_WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email, tempPassword, zohoId, name } = body

    if (!email || !tempPassword || !zohoId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Check for service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
       console.error('Provisioning Error: Missing SUPABASE_SERVICE_ROLE_KEY');
       return NextResponse.json({ error: 'Configuration Error: Missing Service Role Key' }, { status: 500 });
    }

    // 2. Create/Update Supabase Auth User
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

    // 3. Write to Postgres users table (UPSERT)
    try {
      await db.insert(users).values({
        email: email,
        zohoId: zohoId,
        username: email, // Use email as username for now
        password: '', // Password is managed by Supabase Auth
      }).onConflictDoUpdate({
        target: users.email,
        set: {
          zohoId: zohoId,
          username: email,
        }
      })
      console.log(`[Provision] Written to Postgres users table: ${email}`)
    } catch (dbError: any) {
      console.error('[Provision] Postgres write failed:', dbError?.message || dbError)
      // Continue even if Postgres fails - Supabase Auth user is created
    }

    // 4. Update Redis mappings
    try {
      await redis.hset('zoho:map:user_id_to_email', { [String(zohoId)]: email })
      await redis.hset('zoho:map:email_to_user_id', { [email]: String(zohoId) })
      console.log(`[Provision] Updated Redis mappings: ${zohoId} <-> ${email}`)
    } catch (redisError: any) {
      console.error('[Provision] Redis update failed:', redisError?.message || redisError)
      // Continue even if Redis fails
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

