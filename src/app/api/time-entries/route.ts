import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { insertTimeEntrySchema, timeEntries } from '@/lib/schema'

export async function GET() {
  try {
    const entries = await db.select().from(timeEntries)
    return NextResponse.json(entries)
  } catch (error) {
    console.error('Failed to fetch entries:', error)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    const validated = insertTimeEntrySchema.parse(payload)
    const [entry] = await db.insert(timeEntries).values(validated).returning()
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Failed to create entry:', error)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
}

