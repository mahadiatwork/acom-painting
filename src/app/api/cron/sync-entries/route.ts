import { NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { zohoClient } from '@/lib/zoho'
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    console.log('[Cron] Starting Entries Sync...')

    // 1. Query Pending Entries from Firestore
    // Note: In a real app, you might want to limit batch size
    const q = query(collection(db, 'pending_time_entries'), where('status', '==', 'pending'))
    const snapshot = await getDocs(q)
    
    if (snapshot.empty) {
      console.log('[Cron] No pending entries found.')
      return NextResponse.json({ success: true, count: 0, message: 'No pending entries' })
    }

    const results = []
    
    // 2. Process Loop
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data()
      console.log(`[Cron] Processing entry ${docSnap.id}...`)

      try {
        // Push to Zoho
        const zohoResponse = await zohoClient.createTimeEntry({
          ...data,
          // Map fields to Zoho expected format if necessary
          firestoreId: docSnap.id
        })
        
        // Mark as synced
        await updateDoc(doc(db, 'pending_time_entries', docSnap.id), { 
          status: 'synced',
          zohoId: zohoResponse.id,
          syncedAt: new Date().toISOString()
        })
        
        results.push({ id: docSnap.id, status: 'synced' })
      } catch (error) {
        console.error(`[Cron] Failed to sync entry ${docSnap.id}:`, error)
        
        // Mark as error so we don't retry indefinitely without intervention
        // Or implement a retry counter
        await updateDoc(doc(db, 'pending_time_entries', docSnap.id), { 
          status: 'error', 
          errorMessage: error instanceof Error ? error.message : String(error),
          lastAttempt: new Date().toISOString()
        })
        
        results.push({ id: docSnap.id, status: 'error', error: String(error) })
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      processed: results.length, 
      results 
    })

  } catch (error) {
    console.error('[Cron] Entries Sync failed:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
