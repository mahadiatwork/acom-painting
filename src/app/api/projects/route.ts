import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { zohoClient } from '@/lib/zoho'
import { activeJobs } from '@/data/mockData'

export async function GET() {
  try {
    // 1. Try to get from Redis Cache
    const cachedProjects = await redis.get('CACHE_PROJECTS_LIST')
    
    if (cachedProjects) {
      console.log('Serving projects from Redis Cache')
      return NextResponse.json(cachedProjects)
    }

    console.log('Cache miss - Fetching from Zoho')

    // 2. Fallback: Fetch from Zoho directly (Read-Through)
    try {
      const deals = await zohoClient.getDeals()
      
      if (deals && Array.isArray(deals)) {
        // Transform Zoho data to match our standardized structure
        const projects = deals.map((deal: any) => ({
          id: deal.id,
          name: deal.Deal_Name,
          customer: deal.Account_Name?.name || 'Unknown',
          status: deal.Stage || 'Active',
          address: deal.Shipping_Street || '',
          salesRep: deal.Owner?.name || '',
        }))

        // Cache the fresh data (1 hour fallback expiry)
        await redis.set('CACHE_PROJECTS_LIST', JSON.stringify(projects), { ex: 3600 })
        
        return NextResponse.json(projects)
      }
    } catch (zohoError) {
      console.error('Failed to fetch from Zoho:', zohoError)
      // Continue to fallback
    }

    // 3. Final Fallback: Return mock data
    console.warn('Returning mock data as fallback')
    return NextResponse.json(activeJobs)

  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
