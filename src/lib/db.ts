import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

/**
 * Safely encodes a connection string by URL-encoding the password
 * Handles passwords with special characters like ?, @, #, etc.
 * 
 * The issue: If password contains ?, it breaks URL parsing because ? starts query params
 * Solution: Manually parse and encode the password part before URL parsing
 */
function encodeConnectionString(url: string): string {
  try {
    // Match: postgresql://user:password@host:port/database
    const match = url.match(/^(postgresql?:\/\/)([^:]+):([^@]+)@(.+)$/)
    
    if (match) {
      const [, protocol, username, password, rest] = match
      
      // URL-encode the password (handles ?, @, #, %, etc.)
      const encodedPassword = encodeURIComponent(password)
      
      // Reconstruct the URL with encoded password
      return `${protocol}${username}:${encodedPassword}@${rest}`
    }
    
    // If regex doesn't match, try standard URL parsing
    const urlObj = new URL(url)
    if (urlObj.password) {
      urlObj.password = encodeURIComponent(urlObj.password)
    }
    return urlObj.toString()
  } catch (error) {
    // If parsing fails, try to at least encode common special chars in password
    // This is a fallback for edge cases
    console.warn('[DB] Connection string parsing issue, attempting manual fix:', error)
    
    // Try to find and encode password manually
    const passwordMatch = url.match(/:\/\/[^:]+:([^@]+)@/)
    if (passwordMatch) {
      const originalPassword = passwordMatch[1]
      const encodedPassword = encodeURIComponent(originalPassword)
      return url.replace(`:${originalPassword}@`, `:${encodedPassword}@`)
    }
    
    return url
  }
}

// Fallback for build time or when env var is missing
const rawConnectionString = process.env.DATABASE_URL || "postgres://placeholder:placeholder@localhost:5432/placeholder"

// Encode the connection string to handle special characters in password
const connectionString = encodeConnectionString(rawConnectionString)

// Log connection string (without password) for debugging
if (process.env.NODE_ENV === 'development') {
  const safeLog = connectionString.replace(/:([^:@]+)@/, ':****@')
  console.log('[DB] Connection string (sanitized):', safeLog)
  console.log('[DB] Using postgres-js adapter for Supabase compatibility')
}

// For Supabase, we need the connection pooling URL (port 6543) with pgbouncer=true
// postgres-js works better with Supabase's connection pooling than @neondatabase/serverless
let finalConnectionString = connectionString
if (connectionString.includes('supabase.com')) {
  // Check if it's using the direct connection (port 5432) instead of pooler (port 6543)
  if (connectionString.includes(':5432/')) {
    console.warn('[DB] Using direct connection (port 5432). For serverless, use connection pooling (port 6543)')
  }
  
  // Ensure pgbouncer=true is present for connection pooling
  if (connectionString.includes('pooler.supabase.com') && !connectionString.includes('pgbouncer=true')) {
    const separator = connectionString.includes('?') ? '&' : '?'
    finalConnectionString = `${connectionString}${separator}pgbouncer=true`
    console.log('[DB] Added pgbouncer=true to connection string')
  }
}

// Initialize postgres client with error handling
// postgres-js handles Supabase connection pooling better than @neondatabase/serverless
let client
try {
  // For serverless, we need to limit connections and use connection pooling
  client = postgres(finalConnectionString, {
    max: 1, // Single connection for serverless (pgbouncer handles pooling)
    idle_timeout: 20,
    connect_timeout: 10,
  })
  console.log('[DB] Postgres client initialized successfully')
} catch (error: any) {
  console.error('[DB] Failed to initialize postgres client:', error?.message || error)
  // Log sanitized connection string for debugging
  const safeLog = finalConnectionString.replace(/:([^:@]+)@/, ':****@')
  console.error('[DB] Connection string (sanitized):', safeLog)
  throw error
}

export const db = drizzle(client, { schema })
