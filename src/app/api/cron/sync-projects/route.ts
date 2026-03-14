import { NextResponse } from 'next/server'
import { zohoClient } from '@/lib/zoho'
import { db } from '@/lib/db'
import { foremen, projects, userProjects } from '@/lib/schema'
import { createAdminClient } from '@/lib/supabase/admin'
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

    // Transform Data - only essential fields
    const projectsData = deals.map((deal: any) => {
      // Get date - prefer Closing_Date, fallback to Project_Start_Date
      let projectDate = ''
      if (deal.Closing_Date) {
        projectDate = deal.Closing_Date
      } else if (deal.Project_Start_Date) {
        projectDate = deal.Project_Start_Date
      }
      
      // Get address - prefer Shipping_Street, or combine address fields
      let projectAddress = ''
      if (deal.Shipping_Street) {
        projectAddress = deal.Shipping_Street
      } else {
        // Combine address components
        const addressParts: string[] = []
        if (deal.Single_Line_1) addressParts.push(deal.Single_Line_1)
        if (deal.Single_Line_2) addressParts.push(deal.Single_Line_2)
        if (deal.State) addressParts.push(deal.State)
        if (deal.Zip_Code) addressParts.push(deal.Zip_Code)
        projectAddress = addressParts.join(', ')
      }
      
      return {
        id: String(deal.id),
        name: deal.Deal_Name || '',
        status: deal.Stage || 'Project Accepted',
        date: projectDate,
        address: projectAddress,
        updatedAt: new Date().toISOString(),
      }
    })

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
                status: project.status,
                date: project.date,
                address: project.address,
                updatedAt: project.updatedAt,
              }
            })
          }
        }
        console.log(`[Cron] Synced ${projectsData.length} projects to Postgres`)
      }
    } catch (dbError: any) {
      console.error('[Cron] Postgres projects sync failed:', dbError?.message || dbError)
      throw dbError
    }

    // ---------------------------------------------------------
    // STEP 2: Project assignments (junction) – foremen are not synced here
    // ---------------------------------------------------------
    // Foremen are pushed to Supabase only by the Zoho workflow (POST /api/webhooks/foremen) when a foreman is created in the Foreman module. We build the foreman-id -> email map from the existing foremen table for the junction.
    const foremenRows = await db.select({ zohoId: foremen.zohoId, email: foremen.email }).from(foremen)
    const userMap = new Map<string, string>() // Zoho Foreman ID -> Email (for junction below)
    for (const row of foremenRows) {
      if (row.zohoId && row.email) userMap.set(row.zohoId, row.email)
    }
    console.log(`[Cron] Foremen in DB (webhook-pushed only): ${userMap.size}`)

    // B. Fetch Junction Records (Foreman/Contractor <-> Projects). Field name from ZOHO_JUNCTION_FOREMAN_LOOKUP_FIELD (e.g. Contractors or Foreman).
    const connections = await zohoClient.getUserJobConnections()
    const foremanLookupField = process.env.ZOHO_JUNCTION_FOREMAN_LOOKUP_FIELD || 'Contractors'

    console.log(`[Cron] Junction foreman lookup field: ${foremanLookupField}, connections: ${connections?.length ?? 0}`)

    // C. Group Connections by Foreman Email
    const userProjectsMap = new Map<string, Set<string>>() // Email -> Set<DealID>
    let connectionCount = 0

    if (connections && Array.isArray(connections)) {
      for (const conn of connections) {
        const userId = conn[foremanLookupField]?.id
        const dealId = conn.Projects?.id
        
        if (userId && dealId) {
          const email = userMap.get(userId)
          if (email) {
            if (!userProjectsMap.has(email)) userProjectsMap.set(email, new Set())
            userProjectsMap.get(email)!.add(dealId)
            connectionCount++
          } else {
            console.warn(`[Cron] No email found for foreman ID: ${userId}`)
          }
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
      // Continue even if Postgres fails
    }

    // ---------------------------------------------------------
    // STEP 3: Sync Painters from Zoho to Supabase (same DB the portal uses)
    // ---------------------------------------------------------
    let paintersSynced = 0
    try {
      const zohoPainters = await zohoClient.getPainters()
      if (zohoPainters && zohoPainters.length > 0) {
        const supabase = createAdminClient()
        const nowIso = new Date().toISOString()
        for (const p of zohoPainters) {
          const id = p.id
          const name = (p as { Name?: string }).Name ?? ''
          if (!id || !name) continue
          const active = (p as { Active?: boolean }).Active !== false
          const { error } = await supabase.from('painters').upsert(
            {
              id: String(id),
              name: String(name),
              email: (p as { Email?: string }).Email ?? null,
              phone: (p as { Phone?: string }).Phone ?? null,
              active,
              updated_at: nowIso,
            },
            { onConflict: 'id' }
          )
          if (!error) paintersSynced++
          else console.warn('[Cron] Painter upsert failed:', id, error.message)
        }
        console.log(`[Cron] Synced ${paintersSynced} painters to Supabase`)
      }
    } catch (err: any) {
      console.error('[Cron] Painters sync failed:', err?.message || err)
    }

    return NextResponse.json({ 
      success: true, 
      projectsCount: projectsData.length,
      foremenCount: userMap.size,
      connectionsProcessed: connectionCount,
      postgresConnectionsSynced: postgresConnectionsSynced,
      paintersSynced,
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
