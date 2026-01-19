import { db } from '@/lib/db'
import { timeEntries, users } from '@/lib/schema'
import { zohoClient } from '@/lib/zoho'
import { getUserTimezoneOffset } from '@/lib/timezone'
import { eq, and } from 'drizzle-orm'

interface TimeEntryData {
  id: string
  userId: string
  jobId: string
  jobName: string
  date: string
  startTime: string
  endTime: string
  lunchStart: string
  lunchEnd: string
  totalHours: string
  notes?: string
  changeOrder?: string
  synced?: boolean
}

/**
 * Looks up Portal User ID from email using Postgres users table
 */
async function getPortalUserIdFromEmail(email: string): Promise<string | null> {
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    return user?.zohoId || null
  } catch (error) {
    console.error('[Sync] Failed to lookup Portal User ID:', error)
    return null
  }
}

/**
 * Updates Postgres entry with synced flag
 */
async function updateSyncedFlag(entryId: string): Promise<void> {
  try {
    await db.update(timeEntries)
      .set({ synced: true })
      .where(eq(timeEntries.id, entryId))
    console.log(`[Sync] Updated Postgres synced flag: ${entryId}`)
  } catch (error) {
    console.error(`[Sync] Failed to update synced flag for entry ${entryId}:`, error)
  }
}

/**
 * Checks if error is a database connection error
 */
function isDatabaseConnectionError(error: any): boolean {
  if (!error) return false
  const errorMessage = error?.message || error?.code || String(error)
  const errorString = errorMessage.toLowerCase()
  return (
    errorString.includes('econnrefused') ||
    errorString.includes('enotfound') ||
    errorString.includes('fetch failed') ||
    errorString.includes('connection') ||
    error?.code === 'ECONNREFUSED'
  )
}

export async function syncToPermanentStorage(entryData: TimeEntryData, userEmail: string): Promise<void> {
  let postgresSuccess = false
  let zohoSuccess = false

  try {
    console.log(`[Sync] Starting sync for entry ${entryData.id}`)

    // 1. Write to Postgres (source of truth) - with graceful error handling
    const postgresData = {
      id: entryData.id,
      userId: entryData.userId,
      jobId: entryData.jobId,
      jobName: entryData.jobName,
      date: entryData.date,
      startTime: entryData.startTime,
      endTime: entryData.endTime,
      lunchStart: entryData.lunchStart,
      lunchEnd: entryData.lunchEnd,
      totalHours: entryData.totalHours,
      notes: entryData.notes || '',
      changeOrder: entryData.changeOrder || '',
    }

    try {
      await db.insert(timeEntries).values(postgresData).onConflictDoNothing()
      postgresSuccess = true
      console.log(`[Sync] Written to Postgres: ${entryData.id}`)
    } catch (postgresError: any) {
      // Handle Postgres errors gracefully
      if (isDatabaseConnectionError(postgresError)) {
        // Database is unavailable - this is expected in dev
        const errorMsg = postgresError?.message || postgresError?.cause?.message || String(postgresError)
        console.warn(`[Sync] Postgres unavailable for ${entryData.id} (continuing with Zoho sync)`)
        console.warn(`[Sync] Connection error: ${errorMsg.substring(0, 100)}`)
      } else {
        // Other Postgres errors (constraint violations, etc.)
        console.error(`[Sync] Postgres error for ${entryData.id}:`, postgresError?.message || postgresError)
      }
      // Continue to Zoho sync even if Postgres fails
    }

    // 2. Write to Zoho CRM (UPDATED - correct module, fields, and timezone)
    try {
      // Lookup Portal User ID from email
      const contractorId = await getPortalUserIdFromEmail(userEmail)
      
      if (!contractorId) {
        console.warn(`[Sync] Portal User ID not found for ${userEmail}, skipping Zoho sync`)
        // If Postgres succeeded, mark as synced
        if (postgresSuccess) {
          await updateSyncedFlag(entryData.id)
        }
        return
      }

      // Get timezone offset
      const timezone = getUserTimezoneOffset()
      
      const zohoData = {
        projectId: entryData.jobId,              // Deal ID for Project lookup
        contractorId: contractorId,              // Portal User ID for Contractor lookup
        date: entryData.date,                     // YYYY-MM-DD
        startTime: entryData.startTime,           // HH:MM
        endTime: entryData.endTime,               // HH:MM
        notes: entryData.notes || '',             // Task_Note
        timezone: timezone,                       // -07:00 format
      }

      await zohoClient.createTimeEntry(zohoData)
      zohoSuccess = true
      console.log(`[Sync] Written to Zoho: ${entryData.id}`)
    } catch (zohoError: any) {
      // Zoho sync failure - log but continue
      const errorMessage = zohoError?.message || zohoError?.code || String(zohoError)
      console.error(`[Sync] Zoho sync failed for ${entryData.id}:`, errorMessage)
      // Don't throw - continue to mark as synced if Postgres succeeded
    }

    // 3. Update Postgres: Mark as synced if at least one permanent storage succeeded
    if (postgresSuccess || zohoSuccess) {
      await updateSyncedFlag(entryData.id)
      console.log(`[Sync] Entry ${entryData.id} synced (Postgres: ${postgresSuccess}, Zoho: ${zohoSuccess})`)
    } else {
      console.warn(`[Sync] Entry ${entryData.id} failed to sync to both Postgres and Zoho - will retry later`)
    }
    
  } catch (error) {
    // Unexpected error - log but don't throw
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[Sync] Unexpected error syncing entry ${entryData.id}:`, errorMessage)
    // Don't throw - let it be retried later via piggyback recovery
  }
}

/**
 * Retries failed syncs for a user (piggyback recovery)
 * Queries Postgres for entries with synced: false and retries
 */
export async function retryFailedSyncs(userEmail: string, userId: string): Promise<void> {
  try {
    // Get all unsynced entries from Postgres for this user
    const unsyncedEntries = await db
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.userId, userId),
        eq(timeEntries.synced, false)
      ))
    
    if (!unsyncedEntries || unsyncedEntries.length === 0) {
      return
    }

    console.log(`[Retry] Found ${unsyncedEntries.length} unsynced entries, retrying...`)

    // Retry each failed entry
    for (const entry of unsyncedEntries) {
      try {
        const entryData: TimeEntryData = {
          id: entry.id,
          userId: entry.userId,
          jobId: entry.jobId,
          jobName: entry.jobName,
          date: entry.date,
          startTime: entry.startTime,
          endTime: entry.endTime,
          lunchStart: entry.lunchStart,
          lunchEnd: entry.lunchEnd,
          totalHours: entry.totalHours,
          notes: entry.notes || '',
          changeOrder: entry.changeOrder || '',
          synced: entry.synced,
        }
        await syncToPermanentStorage(entryData, userEmail)
      } catch (error) {
        console.error(`[Retry] Failed to retry entry ${entry.id}:`, error)
        // Continue with next entry
      }
    }

    console.log(`[Retry] Completed retry for ${unsyncedEntries.length} entries`)
  } catch (error) {
    console.error('[Retry] Failed to retry syncs:', error)
    // Don't throw - this is a background operation
  }
}

