import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Ensure SSL is enabled for secure connections; sslmode=disable opts out (local Postgres)
const databaseUrl = process.env.DATABASE_URL;
const sslDisabled = databaseUrl.includes('sslmode=disable');
const sslEnabledUrl = databaseUrl.includes('sslmode=')
  ? databaseUrl
  : `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}sslmode=require`;

export const pool = new Pool({
  connectionString: sslEnabledUrl,
  ssl: sslDisabled ? false : {
    rejectUnauthorized: false // Allow self-signed certificates for cloud providers
  },
  // Connection pool limits to prevent "too many connections" errors
  max: 10, // Maximum 10 connections in the pool
  min: 1,  // Keep at least 1 connection alive
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Wait 5 seconds for connection
  statement_timeout: 30000, // 30 second statement timeout
  query_timeout: 30000 // 30 second query timeout
});

// Prevent idle-connection terminations (e.g. Postgres "57P01 terminating
// connection due to administrator command" from Neon recycling idle clients)
// from bubbling up as an unhandled 'error' event and crashing the process.
pool.on('error', (err) => {
  console.error('[db] Unexpected idle client error (recovered):', (err as any).code ?? '', err.message);
});

pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.error('[db] Client error (recovered):', (err as any).code ?? '', err.message);
  });
});

export const db = drizzle(pool, { schema });
