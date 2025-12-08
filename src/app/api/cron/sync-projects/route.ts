import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { zohoClient } from '@/lib/zoho'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Optional: Check for Authorization header if you want to secure this endpoint manually
    // const authHeader = request.headers.get('Authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { ... }

    console.log('[Cron] Starting Project Sync (Reconciliation)...')

    // 1. Fetch ALL active deals from Zoho CRM
    const deals = await zohoClient.getDeals()
    
    if (!deals || !Array.isArray(deals)) {
      throw new Error('Invalid response from Zoho CRM')
    }

    // 2. Transform Data to match frontend needs
    const projects = deals.map((deal: any) => ({
      id: deal.id,
      name: deal.Deal_Name,
      customer: deal.Account_Name?.name || 'Unknown',
      status: deal.Stage || 'Active',
      // Add other fields if needed for the UI
    }))

    // 3. Overwrite Redis Cache
    // We store the entire list under one key for O(1) retrieval
    // Expiry: 25 hours (allows for one missed daily sync without outage)
    await redis.set('CACHE_PROJECTS_LIST', JSON.stringify(projects), { ex: 90000 })
    
    console.log(`[Cron] Synced ${projects.length} projects to Redis`)

    return NextResponse.json({ 
      success: true, 
      count: projects.length,
      mode: 'reconciliation',
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
