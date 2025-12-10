import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { projects, userProjects } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 1. Authenticate User
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log(`[API] Fetching projects for user: ${user.email}`)

    // 2. Try Redis first (Hot - Fast Cache)
    const projectIds = await redis.smembers(`user:${user.email}:projects`)
    console.log(`[API] Found ${projectIds?.length || 0} project IDs in Redis for ${user.email}`)
    
    let parsedProjects: any[] = []
    
    if (projectIds && projectIds.length > 0) {
      // 3. Fetch Details for Allowed IDs from Redis (Batch Fetch)
      // Upstash hmget returns an object with keys, or array depending on usage
      const projectsJson = await redis.hmget('projects:data', ...projectIds)
      console.log(`[API] Redis hmget result type:`, typeof projectsJson, Array.isArray(projectsJson) ? 'array' : 'object')
      console.log(`[API] Redis hmget result keys:`, projectsJson ? Object.keys(projectsJson) : 'null')
      
      if (projectsJson) {
        // Handle both object and array responses from Upstash
        let projectValues: any[] = []
        
        if (Array.isArray(projectsJson)) {
          // If it's an array, use it directly
          projectValues = projectsJson
        } else if (typeof projectsJson === 'object') {
          // If it's an object, get values
          projectValues = Object.values(projectsJson)
        }
        
        parsedProjects = projectValues
          .filter(item => item !== null && item !== undefined)
          .map(json => {
            try {
              // Handle both string and already-parsed objects
              if (typeof json === 'string') {
                return JSON.parse(json)
              } else if (typeof json === 'object') {
                return json
              }
              return null
            } catch (e) {
              console.error('[API] Failed to parse project JSON:', e, 'Raw value:', json)
              return null
            }
          })
          .filter(p => p !== null && p.id) // Ensure we have valid projects with IDs
        console.log(`[API] Parsed ${parsedProjects.length} projects from Redis`)
      }
    } else {
      console.log(`[API] No project IDs found in Redis for ${user.email}`)
    }

    // 4. If Redis miss or empty, fallback to Postgres (Warm - Permanent Storage)
    if (parsedProjects.length === 0) {
      console.log(`[API] Redis miss for ${user.email}, falling back to Postgres`)
      
      try {
        // Query Postgres: JOIN user_projects with projects
        console.log(`[API] Querying Postgres for user_email: ${user.email}`)
        const postgresProjects = await db
          .select({
            id: projects.id,
            name: projects.name,
            customer: projects.customer,
            status: projects.status,
            address: projects.address,
            salesRep: projects.salesRep,
            supplierColor: projects.supplierColor,
            trimColor: projects.trimColor,
            accessoryColor: projects.accessoryColor,
            gutterType: projects.gutterType,
            sidingStyle: projects.sidingStyle,
            workOrderLink: projects.workOrderLink,
          })
          .from(userProjects)
          .innerJoin(projects, eq(userProjects.projectId, projects.id))
          .where(eq(userProjects.userEmail, user.email))

        console.log(`[API] Postgres query returned ${postgresProjects.length} rows`)

        parsedProjects = postgresProjects.map(p => ({
          id: p.id,
          name: p.name,
          customer: p.customer,
          status: p.status,
          address: p.address || '',
          salesRep: p.salesRep || '',
          supplierColor: p.supplierColor || '',
          trimColor: p.trimColor || '',
          accessoryColor: p.accessoryColor || '',
          gutterType: p.gutterType || '',
          sidingStyle: p.sidingStyle || '',
          workOrderLink: p.workOrderLink || '',
        }))

        console.log(`[API] Fetched ${parsedProjects.length} projects from Postgres for ${user.email}`)
        if (parsedProjects.length > 0) {
          console.log(`[API] Project IDs from Postgres:`, parsedProjects.map(p => p.id))
        }

        // 5. Populate Redis cache for future reads
        if (parsedProjects.length > 0) {
          // Update projects:data hash
          const projectHash: Record<string, string> = {}
          parsedProjects.forEach(p => {
            projectHash[p.id] = JSON.stringify(p)
          })
          await redis.hset('projects:data', projectHash)

          // Update user:email:projects set
          const idsArray = parsedProjects.map(p => p.id) as [string, ...string[]]
          if (idsArray.length > 0) {
            await redis.sadd(`user:${user.email}:projects`, ...idsArray)
          }

          console.log(`[API] Populated Redis cache for ${user.email}`)
        }
      } catch (dbError: any) {
        console.error('[API] Postgres fallback failed:', dbError?.message || dbError)
        // Return empty array if both Redis and Postgres fail
        return NextResponse.json([])
      }
    }

    return NextResponse.json(parsedProjects)

  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
