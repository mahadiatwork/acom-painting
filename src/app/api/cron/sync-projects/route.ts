import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { zohoClient } from '@/lib/zoho'
import { db } from '@/lib/db'
import { projects, userProjects, users } from '@/lib/schema'
import { eq, inArray } from 'drizzle-orm'

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
    const projectsData = deals.map((deal: any) => ({
      id: String(deal.id),
      name: deal.Deal_Name || '',
      customer: deal.Account_Name?.name || 'Unknown',
      status: deal.Stage || 'Active',
      address: deal.Shipping_Street || '',
      salesRep: deal.Owner?.name || '',
      supplierColor: deal.Supplier_Color || '',
      trimColor: deal.Trim_Coil_Color || '',
      accessoryColor: deal.Shingle_Accessory_Color || '',
      gutterType: deal.Gutter_Types || '',
      sidingStyle: deal.Siding_Style || '',
      workOrderLink: '',
      updatedAt: new Date().toISOString(),
    }))

    // 1. Write to Postgres projects table (batch UPSERT)
    try {
      if (projectsData.length > 0) {
        // Use batch insert with onConflictDoUpdate
        // Drizzle doesn't support batch onConflictDoUpdate directly, so we'll do it in chunks
        const chunkSize = 100
        for (let i = 0; i < projectsData.length; i += chunkSize) {
          const chunk = projectsData.slice(i, i + chunkSize)
          for (const project of chunk) {
            await db.insert(projects).values(project).onConflictDoUpdate({
              target: projects.id,
              set: {
                name: project.name,
                customer: project.customer,
                status: project.status,
                address: project.address,
                salesRep: project.salesRep,
                supplierColor: project.supplierColor,
                trimColor: project.trimColor,
                accessoryColor: project.accessoryColor,
                gutterType: project.gutterType,
                sidingStyle: project.sidingStyle,
                workOrderLink: project.workOrderLink,
                updatedAt: project.updatedAt,
              }
            })
          }
        }
        console.log(`[Cron] Synced ${projectsData.length} projects to Postgres`)
      }
    } catch (dbError: any) {
      console.error('[Cron] Postgres projects sync failed:', dbError?.message || dbError)
      // Continue to Redis update even if Postgres fails
    }

    // 2. Store in Redis Hash: projects:data
    const projectHash: Record<string, string> = {}
    projectsData.forEach(p => {
      projectHash[p.id] = JSON.stringify(p)
    })

    // Reset and Populate Hash
    await redis.del('projects:data')
    if (Object.keys(projectHash).length > 0) {
      await redis.hset('projects:data', projectHash)
    }
    console.log(`[Cron] Synced ${projectsData.length} projects to Redis Hash`)

    // ---------------------------------------------------------
    // STEP 2: Sync User Access (Optimized via Junction Module)
    // ---------------------------------------------------------
    
    // A. Build User Map (ID -> Email) and sync to Postgres
    const portalUsers = await zohoClient.getPortalUsers()
    const userMap = new Map<string, string>() // ID -> Email
    
    if (portalUsers && Array.isArray(portalUsers)) {
      portalUsers.forEach((u: any) => {
        if (u.Email && u.id) userMap.set(u.id, u.Email)
      })
    }

    // Sync users to Postgres (UPSERT)
    try {
      if (userMap.size > 0) {
        for (const [userId, email] of userMap.entries()) {
          await db.insert(users).values({
            email: email,
            zohoId: userId,
            username: email,
            password: '', // Password managed by Supabase Auth
          }).onConflictDoUpdate({
            target: users.email,
            set: {
              zohoId: userId,
              username: email,
            }
          })
        }
        console.log(`[Cron] Synced ${userMap.size} users to Postgres`)
      }
    } catch (dbError: any) {
      console.error('[Cron] Postgres users sync failed:', dbError?.message || dbError)
      // Continue even if Postgres fails
    }

    // PERSIST MAP for Webhooks (Redis)
    if (userMap.size > 0) {
      const mapObject = Object.fromEntries(userMap)
      await redis.del('zoho:map:user_id_to_email')
      await redis.hset('zoho:map:user_id_to_email', mapObject)
    }

    // Store reverse map: email -> portal_user_id (for fast Contractor lookup in time entries)
    const emailToUserIdMap: Record<string, string> = {}
    for (const [userId, email] of userMap.entries()) {
      emailToUserIdMap[email] = userId
    }
    
    if (Object.keys(emailToUserIdMap).length > 0) {
      await redis.del('zoho:map:email_to_user_id')
      await redis.hset('zoho:map:email_to_user_id', emailToUserIdMap)
      console.log(`[Cron] Stored ${Object.keys(emailToUserIdMap).length} email->user_id mappings in Redis`)
    }

    // B. Fetch Junction Records (Portal_Us_X_Job_Ticke)
    const connections = await zohoClient.getUserJobConnections()
    
    // DEBUG: Log raw connection data from Zoho
    console.log(`[Cron] Raw connections from Zoho:`, JSON.stringify(connections, null, 2))
    console.log(`[Cron] Number of connections fetched:`, connections?.length || 0)
    
    // C. Group Connections by User Email
    const userProjectsMap = new Map<string, Set<string>>() // Email -> Set<DealID>
    let connectionCount = 0

    if (connections && Array.isArray(connections)) {
      for (const conn of connections) {
        // DEBUG: Log each connection structure
        console.log(`[Cron] Processing connection:`, JSON.stringify(conn, null, 2))
        
        // Lookup field names from the Junction Module
        const userId = conn.Contractors?.id
        const dealId = conn.Projects?.id
        
        console.log(`[Cron] Extracted - userId: ${userId}, dealId: ${dealId}`)
        
        if (userId && dealId) {
          const email = userMap.get(userId)
          console.log(`[Cron] User ID ${userId} maps to email: ${email}`)
          if (email) {
            if (!userProjectsMap.has(email)) userProjectsMap.set(email, new Set())
            userProjectsMap.get(email)!.add(dealId)
            connectionCount++
            console.log(`[Cron] Added connection: ${email} -> ${dealId}`)
          } else {
            console.warn(`[Cron] No email found for user ID: ${userId}`)
          }
        } else {
          console.warn(`[Cron] Missing userId or dealId in connection:`, conn)
        }
      }
    }
    
    console.log(`[Cron] Total connections processed: ${connectionCount}`)
    console.log(`[Cron] User-Project map:`, Array.from(userProjectsMap.entries()).map(([email, projects]) => ({
      email,
      projectIds: Array.from(projects)
    })))

    // D. Sync user_projects to Postgres (reconciliation: delete all, then insert new)
    let postgresConnectionsSynced = 0
    try {
      if (userMap.size > 0) {
        // For each user, delete all existing connections, then insert new ones
        for (const [userId, email] of userMap.entries()) {
          const dealIds = userProjectsMap.get(email)
          
          // Delete all existing connections for this user
          await db.delete(userProjects).where(eq(userProjects.userEmail, email))
          
          // Insert new connections
          if (dealIds && dealIds.size > 0) {
            const connectionsToInsert = Array.from(dealIds).map(dealId => ({
              userEmail: email,
              projectId: String(dealId),
            }))
            
            console.log(`[Cron] Inserting ${connectionsToInsert.length} connections for ${email}:`, connectionsToInsert)
            
            if (connectionsToInsert.length > 0) {
              await db.insert(userProjects).values(connectionsToInsert).onConflictDoNothing()
              postgresConnectionsSynced += connectionsToInsert.length
            }
          }
        }
        console.log(`[Cron] Synced ${postgresConnectionsSynced} user-project connections to Postgres`)
      }
    } catch (dbError: any) {
      console.error('[Cron] Postgres user_projects sync failed:', dbError?.message || dbError)
      console.error('[Cron] Full error:', dbError)
      // Continue to Redis update even if Postgres fails
    }

    // E. Update Redis for ALL users (to ensure we clear revoked access)
    let updatedUsers = 0
    
    for (const [userId, email] of userMap.entries()) {
        const dealIds = userProjectsMap.get(email)
        const userKey = `user:${email}:projects`
        
        // Always clear old key first
        await redis.del(userKey)
        
        if (dealIds && dealIds.size > 0) {
            const idsArray = Array.from(dealIds) as [string, ...string[]]
            await redis.sadd(userKey, ...idsArray)
            updatedUsers++
        }
    }

    return NextResponse.json({ 
      success: true, 
      projectsCount: projectsData.length,
      usersSynced: updatedUsers,
      connectionsProcessed: connectionCount,
      postgresConnectionsSynced: postgresConnectionsSynced,
      timestamp: new Date().toISOString(),
      // DEBUG: Include raw data for troubleshooting
      debug: {
        rawConnectionsFromZoho: connections,
        userProjectsMap: Array.from(userProjectsMap.entries()).map(([email, projects]) => ({
          email,
          projectIds: Array.from(projects)
        })),
        userMap: Array.from(userMap.entries())
      }
    })

  } catch (error) {
    console.error('[Cron] Sync failed:', error)
    return NextResponse.json({ 
      error: 'Sync failed', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 })
  }
}
