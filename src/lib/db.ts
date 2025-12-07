import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Fallback for build time or when env var is missing
const connectionString = process.env.DATABASE_URL || "postgres://placeholder:placeholder@localhost:5432/placeholder"

const sql = neon(connectionString)
export const db = drizzle(sql, { schema })
