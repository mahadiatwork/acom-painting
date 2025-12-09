import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { zohoClient } from '@/lib/zoho'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    console.log('[Cron] Starting User-Scoped Sync...')

    // ---------------------------------------------------------
    // STEP 1: Sync Global Project Data (Source of Truth for Details)
    // ---------------------------------------------------------
    const deals = await zohoClient.getDeals()
    
    if (!deals || !Array.isArray(deals)) {
      throw new Error('Invalid response from Zoho CRM (Deals)')
    }

    // Transform Data
    const projects = deals.map((deal: any) => ({
      id: deal.id,
      name: deal.Deal_Name,
      customer: deal.Account_Name?.name || 'Unknown',
      status: deal.Stage || 'Active',
      address: deal.Shipping_Street || '',
      salesRep: deal.Owner?.name || '',
      supplierColor: deal.Supplier_Color || '',
      trimColor: deal.Trim_Coil_Color || '',
      accessoryColor: deal.Shingle_Accessory_Color || '',
      gutterType: deal.Gutter_Types || '',
      sidingStyle: deal.Siding_Style || '',
    }))

    // Store in Redis Hash: projects:data
    const projectHash: Record<string, string> = {}
    projects.forEach(p => {
      projectHash[p.id] = JSON.stringify(p)
    })

    // Reset and Populate Hash
    await redis.del('projects:data')
    if (Object.keys(projectHash).length > 0) {
      await redis.hset('projects:data', projectHash)
    }
    console.log(`[Cron] Synced ${projects.length} projects to Global Hash`)

    // ---------------------------------------------------------
    // STEP 2: Sync User Access (Optimized via Junction Module)
    // ---------------------------------------------------------
    
    // A. Build User Map (ID -> Email)
    const portalUsers = await zohoClient.getPortalUsers()
    const userMap = new Map<string, string>() // ID -> Email
    
    if (portalUsers && Array.isArray(portalUsers)) {
      portalUsers.forEach((u: any) => {
        if (u.Email && u.id) userMap.set(u.id, u.Email)
      })
    }

    // B. Fetch Junction Records (Portal_Us_X_Job_Ticke)
    // This fetches ALL connections in one go (or paged)
    const connections = await zohoClient.getUserJobConnections()
    
    // C. Group Connections by User Email
    const userProjects = new Map<string, Set<string>>() // Email -> Set<DealID>
    let connectionCount = 0

    if (connections && Array.isArray(connections)) {
      for (const conn of connections) {
        // Looking for Lookup fields. API names assumed: Portal_User, Job_Ticket
        const userId = conn.Portal_User?.id
        const dealId = conn.Job_Ticket?.id
        
        if (userId && dealId) {
          const email = userMap.get(userId)
          if (email) {
            if (!userProjects.has(email)) userProjects.set(email, new Set())
            userProjects.get(email)!.add(dealId)
            connectionCount++
          }
        }
      }
    }

    // D. Update Redis for ALL users (to ensure we clear revoked access)
    let updatedUsers = 0
    
    for (const [userId, email] of userMap.entries()) {
        const dealIds = userProjects.get(email)
        const userKey = `user:${email}:projects`
        
        // Always clear old key first
        await redis.del(userKey)
        
        if (dealIds && dealIds.size > 0) {
            await redis.sadd(userKey, ...Array.from(dealIds))
            updatedUsers++
        }
    }

    return NextResponse.json({ 
      success: true, 
      projectsCount: projects.length,
      usersSynced: updatedUsers,
      connectionsProcessed: connectionCount,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Cron] Sync failed:', error)
    return NextResponse.json({ 
      error: 'Sync failed', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 })
  }
}
