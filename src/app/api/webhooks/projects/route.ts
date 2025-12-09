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

    // 2. Fetch existing deal from Global Hash to preserve fields
    const existingJson = await redis.hget<string>('projects:data', String(id))
    const existingProject = existingJson ? JSON.parse(existingJson) : {}
    
    // 3. Transform & Merge
    const newProject = {
      ...existingProject, 
      id: String(id),
      name: Deal_Name,
      customer: Account_Name || existingProject.customer || 'Unknown',
      status: Stage || existingProject.status || 'Active',
      
      // New Fields (mapped from Zoho payload keys)
      supplierColor: payload.Supplier_Color || existingProject.supplierColor || '',
      trimColor: payload.Trim_Coil_Color || existingProject.trimColor || '',
      accessoryColor: payload.Shingle_Accessory_Color || existingProject.accessoryColor || '',
      gutterType: payload.Gutter_Types || existingProject.gutterType || '',
      sidingStyle: payload.Siding_Style || existingProject.sidingStyle || '',
      
      // Fields that might be missing in webhook but exist in cache
      address: payload.Shipping_Street || existingProject.address || '',
      salesRep: payload.Owner || existingProject.salesRep || '',
    }

    // 4. Update Global Hash
    // We treat Redis as the "Read Model". We patch it directly.
    await redis.hset('projects:data', { [String(id)]: JSON.stringify(newProject) })

    console.log(`[Webhook] Patched project ${id} in Redis Hash`)

    return NextResponse.json({ success: true, action: existingJson ? 'updated' : 'created' })

  } catch (error) {
    console.error('[Webhook] Project Patch failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
