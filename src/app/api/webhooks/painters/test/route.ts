import { NextRequest, NextResponse } from 'next/server'

/**
 * ECHO TEST – no auth, no database.
 * Use this to see exactly what your client (Zoho, Postman, curl) sends.
 *
 * GET  /api/webhooks/painters/test → instructions
 * POST /api/webhooks/painters/test → echoes body + headers, returns 200
 */

export async function GET() {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
  return NextResponse.json({
    message: 'Painters webhook echo test',
    usage: {
      testEcho: `POST ${base}/api/webhooks/painters/test`,
      realWebhook: `POST ${base}/api/webhooks/painters (requires Authorization: Bearer ZOHO_WEBHOOK_SECRET)`,
    },
    steps: [
      '1. POST to this /test URL with body: {"id":"123","Name":"Test Painter","Email":"t@t.com","Phone":"","Active":true}',
      '2. Check the response to see exactly what the server received (rawBody, contentType, parsed).',
      '3. In Zoho, temporarily set url to this /test URL and use body: jsonBody to confirm the payload.',
      '4. When echo looks correct, switch Zoho back to /api/webhooks/painters and ensure painters table exists in Supabase.',
    ],
  })
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''
  let rawBody = ''
  let parsed: unknown = null
  let parseError: string | null = null

  try {
    rawBody = await request.text()
  } catch (e) {
    rawBody = '(failed to read body)'
  }

  if (rawBody && rawBody.trim()) {
    if (contentType.includes('application/json')) {
      try {
        parsed = JSON.parse(rawBody) as unknown
      } catch (e) {
        parseError = e instanceof Error ? e.message : String(e)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    message: 'Echo test – no database, no auth',
    received: {
      contentType,
      rawBodyLength: rawBody.length,
      rawBodySample: rawBody.slice(0, 500),
      parsed,
      parseError,
      hasAuth: !!request.headers.get('authorization'),
    },
  })
}
