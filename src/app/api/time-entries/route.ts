import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    // TODO: Replace with actual database query when schema is updated
    // const entries = await db.select().from(timeEntries)
    // For now, return mock data structure
    return NextResponse.json([
      {
        id: 501,
        jobId: 101,
        jobName: "Smith Residence - Roof Replacement",
        date: "2023-10-26",
        startTime: "07:00",
        endTime: "15:30",
        lunchStart: "12:00",
        lunchEnd: "12:30",
        totalHours: 8.0,
        synced: true,
        notes: "Completed tear-off and dried in."
      },
      {
        id: 502,
        jobId: 102,
        jobName: "Commercial Center - Repair",
        date: "2023-10-25",
        startTime: "08:00",
        endTime: "16:00",
        lunchStart: "12:00",
        lunchEnd: "12:30",
        totalHours: 7.5,
        synced: true,
        notes: "Patched leaks on north side."
      }
    ])
  } catch (error) {
    console.error('Failed to fetch entries:', error)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // TODO: Validate with schema and insert into database
    // const validated = insertTimeEntrySchema.parse(body)
    // const [entry] = await db.insert(timeEntries).values(validated).returning()
    
    console.log('Time entry submitted:', body)
    return NextResponse.json({ 
      success: true, 
      message: 'Time entry submitted successfully',
      data: body 
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create entry:', error)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
}

