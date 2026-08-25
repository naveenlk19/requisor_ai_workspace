import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// TLS handling, same intent as server/db.ts but via the URL: drizzle-kit
// ignores a separate `ssl` field when `url` is set, so the only reliable
// channel is the sslmode= query param. sslmode=no-verify gives TLS without
// cert verification (Render uses self-signed certs); sslmode=disable is
// honored for local Postgres. Any other sslmode is normalized to no-verify.
const databaseUrl = process.env.DATABASE_URL;
const [baseUrl, queryString] = databaseUrl.split("?");
const params = (queryString ?? "").split("&").filter(Boolean);
const sslDisabled = params.some((p) => p === "sslmode=disable");
const keptParams = params.filter((p) => !p.startsWith("sslmode="));
keptParams.push(sslDisabled ? "sslmode=disable" : "sslmode=no-verify");
const cleanUrl = `${baseUrl}?${keptParams.join("&")}`;

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: cleanUrl,
  },
});
