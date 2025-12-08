import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

export async function POST(request: NextRequest) {
  try {
    // 1. Security Check
    const secret = request.headers.get('x-roofworx-secret')
    if (secret !== process.env.ZOHO_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    const { id, Deal_Name, Account_Name, Stage } = payload

    if (!id || !Deal_Name) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // 2. Fetch current cache
    // We treat Redis as the "Read Model". We patch it directly.
    const cachedData = await redis.get<any[]>('CACHE_PROJECTS_LIST') || []
    
    // 3. Transform incoming deal
    const newProject = {
      id: String(id),
      name: Deal_Name,
      customer: Account_Name || 'Unknown',
      status: Stage || 'Active'
    }

    // 4. Update List (Upsert)
    const existingIndex = cachedData.findIndex(p => p.id === newProject.id)
    
    if (existingIndex >= 0) {
      cachedData[existingIndex] = newProject
    } else {
      cachedData.push(newProject)
    }

    // 5. Save back to Redis
    await redis.set('CACHE_PROJECTS_LIST', JSON.stringify(cachedData), { ex: 90000 })

    console.log(`[Webhook] Patched project ${id} in Redis`)

    return NextResponse.json({ success: true, action: existingIndex >= 0 ? 'updated' : 'created' })

  } catch (error) {
    console.error('[Webhook] Project Patch failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

