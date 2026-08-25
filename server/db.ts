import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// TLS handling. node-postgres assigns values PARSED FROM THE URL over the
// explicit config object, so an `sslmode=` in the connection string silently
// overrides our `ssl` option (with sslmode=require that re-enables strict
// verification and breaks providers with self-signed certs, e.g. Render).
// Therefore: strip sslmode from the URL and let the explicit `ssl` option be
// the single source of truth. sslmode=disable opts out (local Postgres).
const databaseUrl = process.env.DATABASE_URL;
const [baseUrl, queryString] = databaseUrl.split('?');
const params = (queryString ?? '').split('&').filter(Boolean);
const sslDisabled = params.some(p => p === 'sslmode=disable');
const keptParams = params.filter(p => !p.startsWith('sslmode='));
const cleanUrl = keptParams.length ? `${baseUrl}?${keptParams.join('&')}` : baseUrl;

export const pool = new Pool({
  connectionString: cleanUrl,
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
