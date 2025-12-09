import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { createClient } from '@/lib/supabase/server'

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

    // 2. Fetch User's Allowed Project IDs
    const projectIds = await redis.smembers(`user:${user.email}:projects`)
    
    if (!projectIds || projectIds.length === 0) {
      console.log(`[API] No projects found for ${user.email}`)
      return NextResponse.json([])
    }

    // 3. Fetch Details for Allowed IDs (Batch Fetch)
    // hmget returns values for the requested fields (IDs)
    const projectsJson = await redis.hmget('projects:data', ...projectIds)
    
    if (!projectsJson) {
      return NextResponse.json([])
    }

    // 4. Parse and Filter (remove nulls if ID missing in hash)
    const projects = Object.values(projectsJson)
      .filter((json): json is string => typeof json === 'string') // hmget returns { key: value } or array? Upstash SDK usually returns value or null
      // Wait, upstash hmget returns Record<string, unknown> or unknown[] depending on usage?
      // If I pass multiple keys, it returns an array of values in order.
      // Let's verify via Upstash docs behavior assumption: it returns (string | null)[] usually.
      // But upstash-redis might return differently.
      // Actually, standard redis hmget returns array. 
      // If upstash-redis returns object, Object.values covers it.
      // Let's assume array for safety if spread passed.
    
    // Safety: If projectsJson is an object (common in some libs), values() works. 
    // If array, values() works too.
    const parsedProjects = Object.values(projectsJson)
      .filter(item => item !== null && item !== undefined)
      .map(json => {
        try {
          return typeof json === 'string' ? JSON.parse(json) : json
        } catch (e) {
          return null
        }
      })
      .filter(p => p !== null)

    return NextResponse.json(parsedProjects)

  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
