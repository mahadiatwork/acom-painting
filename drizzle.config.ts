import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit needs the DIRECT connection (port 5432) for migrations,
 * not the pooler connection (port 6543).
 * 
 * Runtime code uses DATABASE_URL (pooler) for better serverless performance.
 * Migrations use DATABASE_URL_DIRECT (direct) because drizzle-kit needs full Postgres features.
 */
export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Use direct connection for migrations, fallback to pooler if direct not set
    url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
  },
})
