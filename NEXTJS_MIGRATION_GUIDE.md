# Next.js Migration Guide: Roof Worx Field App

This guide provides step-by-step instructions to convert the current Vite + React + Express application to a **Next.js 14+ App Router** application.

---

## Phase 1: Project Setup

### Step 1.1: Create New Next.js Project
```bash
npx create-next-app@latest roof-worx-nextjs --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

### Step 1.2: Install Dependencies
```bash
cd roof-worx-nextjs

# Core dependencies
npm install @tanstack/react-query axios

# UI Components (Radix UI)
npm install @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-popover @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip

# Utility libraries
npm install class-variance-authority clsx tailwind-merge lucide-react date-fns sonner vaul framer-motion

# Database (Drizzle + PostgreSQL)
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Form handling
npm install react-hook-form @hookform/resolvers zod drizzle-zod

# Architecture dependencies (from ARCHITECTURE_PLAN.md)
npm install @upstash/redis firebase
```

### Step 1.3: Update TypeScript Config
Edit `tsconfig.json` to add path aliases:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@assets/*": ["./public/assets/*"]
    }
  }
}
```

---

## Phase 2: Directory Structure

### Step 2.1: Create Folder Structure
```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── forgot-password/
│   │       └── page.tsx
│   ├── (main)/
│   │   ├── layout.tsx          # Layout with BottomNav
│   │   ├── page.tsx            # Dashboard (Home)
│   │   ├── entry/
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── history/
│   │   │   └── page.tsx
│   │   ├── projects/
│   │   │   └── page.tsx
│   │   ├── notices/
│   │   │   └── page.tsx
│   │   └── profile/
│   │       └── page.tsx
│   ├── api/
│   │   ├── projects/
│   │   │   └── route.ts
│   │   ├── time-entries/
│   │   │   └── route.ts
│   │   └── cron/
│   │       ├── sync-projects/
│   │       │   └── route.ts
│   │       └── sync-entries/
│   │           └── route.ts
│   ├── layout.tsx              # Root layout
│   ├── globals.css
│   └── providers.tsx           # Client providers (Query, Firebase)
├── components/
│   ├── ui/                     # Shadcn components (copy from current)
│   ├── Layout.tsx
│   ├── BottomNav.tsx
│   ├── PrimaryButton.tsx
│   └── FormFields.tsx
├── lib/
│   ├── db.ts                   # Drizzle client
│   ├── schema.ts               # Database schema
│   ├── storage.ts              # Storage interface
│   ├── redis.ts                # Upstash Redis client
│   ├── firebase.ts             # Firebase client config
│   ├── zoho.ts                 # Zoho API client
│   ├── utils.ts
│   └── queryClient.ts
├── hooks/
│   ├── use-toast.ts
│   └── use-mobile.tsx
└── data/
    └── mockData.ts             # Mock data (temporary)
```

### Step 2.2: Copy Assets
```bash
# Copy logo and favicon to public folder
cp attached_assets/image_1764793317196.png public/assets/logo.png
cp client/public/favicon.png public/favicon.png
```

---

## Phase 3: Migrate Global Styles & Providers

### Step 3.1: Copy Global CSS
Copy the contents of `client/src/index.css` to `src/app/globals.css`.

Update the font imports in `src/app/layout.tsx`:
```tsx
import { Inter, Montserrat } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-heading' })

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

### Step 3.2: Create Providers Component
Create `src/app/providers.tsx`:
```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {children}
      </TooltipProvider>
    </QueryClientProvider>
  )
}
```

### Step 3.3: Update Root Layout
Update `src/app/layout.tsx`:
```tsx
import { Providers } from './providers'
import './globals.css'

export const metadata = {
  title: 'Roof Worx - Field Time Entry',
  description: 'Field time tracking application for Roof Worx crews.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

---

## Phase 4: Migrate Components

### Step 4.1: Copy UI Components
Copy all files from `client/src/components/ui/` to `src/components/ui/`.

### Step 4.2: Migrate Custom Components
For each component in `client/src/components/`:

1. Copy the file to `src/components/`
2. Add `'use client'` directive at the top (required for components using hooks/state)
3. Update import paths:
   - `@/lib/utils` stays the same
   - `@assets/...` becomes `/assets/...` or use Next.js Image component

**Example: BottomNav.tsx**
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, Briefcase, User, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    { label: 'Home', icon: Home, href: '/' },
    { label: 'All Entries', icon: List, href: '/history' },
    { label: 'Projects', icon: Briefcase, href: '/projects' },
    { label: 'Notice', icon: Bell, href: '/notices' },
    { label: 'Profile', icon: User, href: '/profile' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-30">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link key={item.label} href={item.href}>
              <div className={cn(
                'flex flex-col items-center justify-center px-2 py-1',
                isActive ? 'text-primary' : 'text-gray-400'
              )}>
                <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

### Step 4.3: Key Changes for All Components
| Old (Vite/Wouter) | New (Next.js) |
|-------------------|---------------|
| `import { Link } from 'wouter'` | `import Link from 'next/link'` |
| `import { useLocation } from 'wouter'` | `import { usePathname, useRouter } from 'next/navigation'` |
| `const [location] = useLocation()` | `const pathname = usePathname()` |
| `const [, setLocation] = useLocation()` | `const router = useRouter(); router.push('/path')` |
| `<Link href="/path">` | `<Link href="/path">` (same) |
| `import img from '@assets/...'` | `import Image from 'next/image'` + `/assets/...` |

---

## Phase 5: Migrate Pages

### Step 5.1: Auth Pages (No BottomNav)

**`src/app/(auth)/login/page.tsx`**
```tsx
'use client'

// Copy contents from client/src/pages/Login.tsx
// Add 'use client' at top
// Replace wouter with next/navigation
// Replace image imports with next/image
```

**`src/app/(auth)/forgot-password/page.tsx`**
```tsx
'use client'

// Copy contents from client/src/pages/ForgotPassword.tsx
// Apply same transformations
```

### Step 5.2: Main App Layout (With BottomNav)

**`src/app/(main)/layout.tsx`**
```tsx
import { BottomNav } from '@/components/BottomNav'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted flex justify-center">
      <div className="w-full max-w-md bg-background min-h-screen shadow-xl flex flex-col relative">
        {children}
        <BottomNav />
      </div>
    </div>
  )
}
```

### Step 5.3: Main Pages
For each page, create the corresponding file:

| Old Location | New Location |
|--------------|--------------|
| `client/src/pages/Dashboard.tsx` | `src/app/(main)/page.tsx` |
| `client/src/pages/NewEntry.tsx` | `src/app/(main)/entry/new/page.tsx` |
| `client/src/pages/History.tsx` | `src/app/(main)/history/page.tsx` |
| `client/src/pages/Projects.tsx` | `src/app/(main)/projects/page.tsx` |
| `client/src/pages/Notices.tsx` | `src/app/(main)/notices/page.tsx` |
| `client/src/pages/Profile.tsx` | `src/app/(main)/profile/page.tsx` |

**For each page:**
1. Add `'use client'` directive at top
2. Replace routing imports (see Step 4.3)
3. Export as `default function PageName()`
4. Update any image imports

---

## Phase 6: Migrate API Routes

### Step 6.1: Database Client
Create `src/lib/db.ts`:
```typescript
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

### Step 6.2: Copy Schema
Copy `shared/schema.ts` to `src/lib/schema.ts`.

### Step 6.3: Create API Route Handlers

**`src/app/api/projects/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects } from '@/lib/schema'

export async function GET() {
  try {
    const allProjects = await db.select().from(projects)
    return NextResponse.json(allProjects)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
```

**`src/app/api/time-entries/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { timeEntries, insertTimeEntrySchema } from '@/lib/schema'

export async function GET() {
  try {
    const entries = await db.select().from(timeEntries)
    return NextResponse.json(entries)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = insertTimeEntrySchema.parse(body)
    const [entry] = await db.insert(timeEntries).values(validated).returning()
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
}
```

### Step 6.4: Cron/Sync Routes (Per ARCHITECTURE_PLAN.md)

**`src/app/api/cron/sync-projects/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { zohoClient } from '@/lib/zoho'

export async function GET() {
  try {
    // Fetch from Zoho CRM
    const projects = await zohoClient.getDeals()
    
    // Cache in Redis with 1-hour expiry
    await redis.set('CACHE_PROJECTS_LIST', JSON.stringify(projects), { ex: 3600 })
    
    return NextResponse.json({ success: true, count: projects.length })
  } catch (error) {
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
```

**Optional future step**
If you still want to push buffered entries to Zoho, you can build a cron route that reads new rows from `src/lib/db`/`time_entries` and posts them to Zoho, marking them as exported. Otherwise the data already lives in Supabase/Neon and is ready to query.

---

## Phase 7: Environment & Configuration

### Step 7.1: Environment Variables
Create `.env.local`:
```env
# Database
DATABASE_URL=postgresql://...

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Firebase (client-side, prefix with NEXT_PUBLIC_)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Zoho CRM (server-side only)
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
ZOHO_API_DOMAIN=https://www.zohoapis.com
```

### Step 7.2: Drizzle Config
Create `drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

### Step 7.3: Update package.json Scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

## Phase 8: Verification & Testing

### Step 8.1: Build Check
```bash
npm run build
```
Fix any TypeScript or build errors.

### Step 8.2: Database Migration
```bash
npm run db:push
```

### Step 8.3: Manual Testing Checklist
- [ ] Login page loads correctly
- [ ] Forgot password flow works
- [ ] Dashboard displays after login
- [ ] Bottom navigation works on all pages
- [ ] New Time Entry multi-step form works
- [ ] Project list loads and detail view works
- [ ] History page displays entries
- [ ] Notices page displays
- [ ] Profile page with logout works
- [ ] Logo displays correctly everywhere

### Step 8.4: API Testing
```bash
# Test project sync
curl http://localhost:3000/api/cron/sync-projects

# Test projects endpoint
curl http://localhost:3000/api/projects

# Test time entries endpoint
curl http://localhost:3000/api/time-entries
```

---

## Summary Checklist

- [ ] Phase 1: Project setup with all dependencies
- [ ] Phase 2: Directory structure created
- [ ] Phase 3: Global styles and providers migrated
- [ ] Phase 4: All components migrated with `'use client'`
- [ ] Phase 5: All pages migrated to App Router structure
- [ ] Phase 6: API routes converted to Route Handlers
- [ ] Phase 7: Environment variables configured
- [ ] Phase 8: Build passes and manual testing complete

---

## Notes for AI Agents

1. **Always add `'use client'`** to components that use React hooks, state, or event handlers.
2. **Replace Wouter with Next.js navigation** - use `next/link` and `next/navigation`.
3. **Use Next.js Image component** for optimized images where possible.
4. **Keep the mobile-first design** - all layouts should remain single-column with max-width constraints.
5. **Preserve the brand colors** - Primary: `#C2A88D`, Secondary: `#2D2D2D`.
6. **Test incrementally** - verify each page works before moving to the next.
