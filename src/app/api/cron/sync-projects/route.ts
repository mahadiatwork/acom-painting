import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { zohoClient } from '@/lib/zoho'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    console.log('[Cron] Starting Project Sync...')

    // 1. Fetch from Zoho CRM
    const deals = await zohoClient.getDeals()
    
    if (!deals || !Array.isArray(deals)) {
      throw new Error('Invalid response from Zoho CRM')
    }

    // 2. Transform Data
    const projects = deals.map((deal: any) => ({
      id: deal.id,
      name: deal.Deal_Name,
      address: deal.Shipping_Street || 'Address not set',
      salesRep: deal.Owner?.name || 'Unknown',
      workOrderLink: deal.Work_Order_URL || '#'
    }))

    // 3. Update Redis Cache (1 hour expiry)
    // We use a slightly longer expiry here to ensure data is always available
    // The cron should run every ~5-15 minutes to keep it fresh
    await redis.set('CACHE_PROJECTS_LIST', JSON.stringify(projects), { ex: 3600 })
    
    console.log(`[Cron] Synced ${projects.length} projects to Redis`)

    return NextResponse.json({ 
      success: true, 
      count: projects.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Cron] Project Sync failed:', error)
    return NextResponse.json({ 
      error: 'Sync failed', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 })
  }
}
