import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Same TLS handling as server/db.ts: an sslmode= in the URL overrides the
// explicit ssl option in node-postgres, and sslmode=require re-enables strict
// verification, which fails on providers with self-signed certs (Render).
// Strip it and let the explicit ssl option below be the single source of truth.
const databaseUrl = process.env.DATABASE_URL;
const [baseUrl, queryString] = databaseUrl.split("?");
const params = (queryString ?? "").split("&").filter(Boolean);
const sslDisabled = params.some((p) => p === "sslmode=disable");
const keptParams = params.filter((p) => !p.startsWith("sslmode="));
const cleanUrl = keptParams.length ? `${baseUrl}?${keptParams.join("&")}` : baseUrl;

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: cleanUrl,
    ssl: sslDisabled ? false : { rejectUnauthorized: false },
  },
});
