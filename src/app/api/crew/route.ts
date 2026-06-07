import { NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { foremen, painters } from '@/lib/schema'

export const dynamic = 'force-dynamic'

type CrewRole = 'painter' | 'foreman'

type CrewMember = {
  id: string
  painterId: string | null
  foremanId: string | null
  name: string
  email: string
  phone: string
  roles: CrewRole[]
  syncReady: boolean
  matchStatus: 'painter' | 'matched_foreman' | 'unmatched_foreman'
}

function normalize(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function addRole(member: CrewMember, role: CrewRole) {
  if (!member.roles.includes(role)) member.roles.push(role)
}

/**
 * GET /api/crew
 * Returns the time-entry worker roster. Painters provide the Zoho lookup id used
 * for submit/sync; foremen are merged into matching painter rows when possible.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [painterRows, foremanRows] = await Promise.all([
      db
        .select({
          id: painters.id,
          name: painters.name,
          email: painters.email,
          phone: painters.phone,
          active: painters.active,
        })
        .from(painters)
        .orderBy(asc(painters.name)),
      db
        .select({
          id: foremen.id,
          zohoId: foremen.zohoId,
          name: foremen.name,
          email: foremen.email,
          phone: foremen.phone,
        })
        .from(foremen)
        .orderBy(asc(foremen.name)),
    ])

    const membersByPainterId = new Map<string, CrewMember>()
    const paintersByEmail = new Map<string, CrewMember>()
    const paintersByName = new Map<string, CrewMember[]>()

    for (const painter of painterRows) {
      const member: CrewMember = {
        id: painter.id,
        painterId: painter.id,
        foremanId: null,
        name: painter.name.trim(),
        email: painter.email ?? '',
        phone: painter.phone ?? '',
        roles: ['painter'],
        syncReady: true,
        matchStatus: 'painter',
      }
      membersByPainterId.set(painter.id, member)

      const emailKey = normalize(painter.email)
      if (emailKey) paintersByEmail.set(emailKey, member)

      const nameKey = normalize(painter.name)
      if (nameKey) {
        const existing = paintersByName.get(nameKey) ?? []
        existing.push(member)
        paintersByName.set(nameKey, existing)
      }
    }

    const unmatchedForemen: CrewMember[] = []

    for (const foreman of foremanRows) {
      const emailKey = normalize(foreman.email)
      const nameKey = normalize(foreman.name)
      const matchedByEmail = emailKey ? paintersByEmail.get(emailKey) : undefined
      const nameMatches = nameKey ? paintersByName.get(nameKey) ?? [] : []
      const matchedByName = nameMatches.length === 1 ? nameMatches[0] : undefined
      const matched = matchedByEmail ?? matchedByName

      if (matched) {
        matched.foremanId = foreman.id
        addRole(matched, 'foreman')
        matched.matchStatus = 'matched_foreman'
        if (!matched.email && foreman.email) matched.email = foreman.email
        if (!matched.phone && foreman.phone) matched.phone = foreman.phone
        continue
      }

      unmatchedForemen.push({
        id: `foreman:${foreman.id}`,
        painterId: null,
        foremanId: foreman.id,
        name: foreman.name.trim(),
        email: foreman.email ?? '',
        phone: foreman.phone ?? '',
        roles: ['foreman'],
        syncReady: false,
        matchStatus: 'unmatched_foreman',
      })
    }

    const crew = [...membersByPainterId.values(), ...unmatchedForemen]
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      crew,
      summary: {
        total: crew.length,
        syncReady: crew.filter((member) => member.syncReady).length,
        unmatchedForemen: unmatchedForemen.length,
      },
    })
  } catch (error) {
    console.error('[API] Failed to fetch crew:', error)
    return NextResponse.json({ error: 'Failed to fetch crew' }, { status: 500 })
  }
}
