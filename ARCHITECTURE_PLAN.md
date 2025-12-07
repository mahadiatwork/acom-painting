# Roof Worx Field App - High-Performance Architecture Plan

**Objective:** Implement a "Read-Aside, Write-Behind" architecture to ensure sub-100ms interactions for field workers, even on slow networks.

## 1. Setup & Configuration

### Dependencies
Install the required packages for the simplified architecture:
```bash
npm install @upstash/redis axios
```

### Environment Variables
Configure the following secrets in Replit (Tools > Secrets):

**Upstash Redis (Read Cache)**
- `UPSTASH_REDIS_REST_URL`: Your database URL
- `UPSTASH_REDIS_REST_TOKEN`: Your access token

**Supabase/Postgres**
- `DATABASE_URL`: Your Supabase/Neon connection string

**Zoho CRM (Source of Truth)**
- `ZOHO_CLIENT_ID`: OAuth Client ID
- `ZOHO_CLIENT_SECRET`: OAuth Client Secret
- `ZOHO_REFRESH_TOKEN`: Long-lived refresh token
- `ZOHO_API_DOMAIN`: e.g., `https://www.zohoapis.com`

### Initialization Files
Create a server-side configuration file (e.g., `server/lib/services.ts`) to initialize clients:

```typescript
import { Redis } from '@upstash/redis';

// Redis Client
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
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

1.  **Direct Write:** On form submit, post the entry to `/api/time-entries` so the data lands immediately in Supabase/Postgres.
2.  **Feedback:** Immediately show the "Success" toast. Do not wait for Zoho.

---

## 4. The Background Sync (The Glue)

**Goal:** (Optional) Move data from Postgres/Supabase to Zoho asynchronously if you still want Zoho exports.

### Backend Sync
The entries are already stored in Postgres. If you want to mirror them to Zoho later, create a cron job that:
1.  Reads the newest entries from Postgres.
2.  Pushes them to Zoho CRM.
3.  Marks them as exported in Postgres (optional).

---

## 5. Security & Context

1.  **Authentication:** Ensure the user is logged in before allowing writes (you can extend to Firebase Auth or another provider later).
2.  **User Mapping:** Attach the user identifier to each time entry row so you can correlate it with Zoho later if needed.
