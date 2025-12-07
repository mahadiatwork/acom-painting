# Roof Worx Field App - High-Performance Architecture Plan

**Objective:** Implement a "Read-Aside, Write-Behind" architecture to ensure sub-100ms interactions for field workers, even on slow networks.

## 1. Setup & Configuration

### Dependencies
Install the required packages for the new architecture:
```bash
npm install @upstash/redis firebase axios
```

### Environment Variables
Configure the following secrets in Replit (Tools > Secrets):

**Upstash Redis (Read Cache)**
- `UPSTASH_REDIS_REST_URL`: Your database URL
- `UPSTASH_REDIS_REST_TOKEN`: Your access token

**Firebase (Write Buffer)**
- `FIREBASE_CONFIG`: The JSON configuration object for your Firebase project
  ```json
  {
    "apiKey": "...",
    "authDomain": "...",
    "projectId": "...",
    "storageBucket": "...",
    "messagingSenderId": "...",
    "appId": "..."
  }
  ```

**Zoho CRM (Source of Truth)**
- `ZOHO_CLIENT_ID`: OAuth Client ID
- `ZOHO_CLIENT_SECRET`: OAuth Client Secret
- `ZOHO_REFRESH_TOKEN`: Long-lived refresh token
- `ZOHO_API_DOMAIN`: e.g., `https://www.zohoapis.com`

### Initialization Files
Create a server-side configuration file (e.g., `server/lib/services.ts`) to initialize clients:

```typescript
import { Redis } from '@upstash/redis';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Redis Client
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Firebase Client (Client-side use primarily, but Admin SDK needed for server if verified there)
// For this plan, we use Client SDK on frontend for writing
```

---

## 2. The "Read" Strategy (Cache Layer)

**Goal:** The "Select Project/Job" dropdown must load instantly.

### Backend: Sync Route (`/api/cron/sync-projects`)
Create an API route to fetch data from Zoho and cache it in Redis.

1.  **Fetch from Zoho:** Use `axios` to call Zoho CRM API (Deals/Projects module).
2.  **Optimize:** Store the *entire list* as a single JSON string in Redis.
    -   **Key:** `CACHE_PROJECTS_LIST`
    -   **Expiry:** 1 hour (`EX 3600`)
3.  **Logic:**
    ```typescript
    // Pseudo-code
    const projects = await zohoClient.get('Deals');
    await redis.set('CACHE_PROJECTS_LIST', JSON.stringify(projects), { ex: 3600 });
    ```

### Frontend: Data Fetching
Create a utility hook `useProjects()`:

1.  **Check Cache:** Call an internal API endpoint (e.g., `/api/projects`) that reads from Redis.
2.  **Fallback:** If Redis returns null (cache miss), the server endpoint should fetch from Zoho directly, populate the cache, and return the data.

---

## 3. The "Write" Strategy (Optimistic Buffer)

**Goal:** Hitting "Submit" on the Time Entry form must be instant.

### Client-Side Implementation
Update `client/src/pages/NewEntry.tsx`:

1.  **Firebase Init:** Initialize Firestore in the React app.
2.  **Direct Write:** On form submit, write directly to Firestore `pending_time_entries` collection.
    ```typescript
    await addDoc(collection(db, "pending_time_entries"), {
      ...formData,
      status: "pending",
      createdAt: serverTimestamp(),
      userId: auth.currentUser.uid
    });
    ```
3.  **Feedback:** Immediately show the "Success" toast. Do not wait for network confirmation from Zoho.

---

## 4. The Background Sync (The Glue)

**Goal:** Move data from Firestore to Zoho asynchronously.

### Backend: Sync Route (`/api/cron/sync-entries`)
Create an API route to process the buffer.

1.  **Query Buffer:** Fetch Firestore documents where `status == 'pending'`.
2.  **Process Loop:**
    -   Format data for Zoho CRM API.
    -   POST to Zoho `Time_Entries` module.
    -   **Success:** Update Firestore doc `status = 'synced'`.
    -   **Failure:** Update Firestore doc `status = 'error'`, add `errorMessage`.
3.  **Automation:** Use Replit Deployments or an external cron service (like cron-job.org) to hit this endpoint every 1-5 minutes.

---

## 5. Security & Context

1.  **Authentication:** Ensure the user is logged in via Firebase Auth before allowing writes.
2.  **User Mapping:** Include the Firebase User ID in the Firestore document to map it back to the correct Zoho User ID during the sync process.
