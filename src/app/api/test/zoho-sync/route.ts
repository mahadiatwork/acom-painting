import { NextRequest, NextResponse } from 'next/server'
import { zohoClient } from '@/lib/zoho'
import { getUserTimezoneOffset } from '@/lib/timezone'

export const dynamic = 'force-dynamic'

/**
 * POST /api/test/zoho-sync
 * Test route to send data directly to Zoho CRM (bypassing Supabase)
 * 
 * This helps debug Zoho integration issues by testing the API call directly
 */
export async function POST(request: NextRequest) {
  try {
    // Parse test data from request body
    const body = await request.json()
    
    // Use provided data or defaults for testing
    const testData = {
      projectId: body.projectId || body.jobId || '6838013000000977057', // Example Deal ID
      contractorId: body.contractorId || body.portalUserId || '6838013000000977001', // Example Portal User ID
      date: body.date || '2026-01-21',
      startTime: body.startTime || '09:00',
      endTime: body.endTime || '17:00',
      lunchStart: body.lunchStart || '12:00',
      lunchEnd: body.lunchEnd || '13:00',
      totalHours: body.totalHours || '8.00',
      notes: body.notes || 'Test entry from API',
      timezone: getUserTimezoneOffset(),
      sundryItems: body.sundryItems || {
        Masking_Paper_Roll: 2,
        Plastic_Roll: 1,
        Tip: 5,
      },
    }

    console.log('[Test] Sending test data to Zoho:', JSON.stringify(testData, null, 2))

    // Call Zoho API directly
    const result = await zohoClient.createTimeEntry(testData)

    console.log('[Test] Zoho API response:', JSON.stringify(result, null, 2))

    return NextResponse.json({
      success: true,
      message: 'Test entry created in Zoho CRM',
      zohoResponse: result,
      testData: testData,
    }, { status: 200 })

  } catch (error: any) {
    console.error('[Test] Zoho sync error:', error)
    
    // Extract detailed error information
    const errorDetails = {
      message: error?.message || String(error),
      code: error?.code,
      response: error?.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      } : null,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to create test entry in Zoho',
      details: errorDetails,
    }, { status: 500 })
  }
}

/**
 * GET /api/test/zoho-sync
 * Returns information about the test endpoint and current Zoho configuration
 */
export async function GET() {
  const timezone = getUserTimezoneOffset()
  
  return NextResponse.json({
    message: 'Zoho Sync Test Endpoint',
    usage: {
      method: 'POST',
      endpoint: '/api/test/zoho-sync',
      description: 'Send test data directly to Zoho CRM',
    },
    examplePayload: {
      projectId: '6838013000000977057', // Deal ID
      contractorId: '6838013000000977001', // Portal User ID
      date: '2026-01-21',
      startTime: '09:00',
      endTime: '17:00',
      lunchStart: '12:00',
      lunchEnd: '13:00',
      totalHours: '8.00',
      notes: 'Test entry',
      sundryItems: {
        Masking_Paper_Roll: 2,
        Plastic_Roll: 1,
        Tip: 5,
      },
    },
    currentConfig: {
      timezone: timezone,
      zohoApiDomain: process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com',
      hasAccessTokenUrl: !!process.env.ZOHO_ACCESS_TOKEN_URL,
      hasClientCredentials: !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN),
    },
  })
}
