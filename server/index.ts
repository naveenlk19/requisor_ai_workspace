import { Sentry } from "./instrument"; // must stay the FIRST import
import express, { type Request, Response, NextFunction } from "express";
import multer from "multer";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedData } from "./seed-data";
import { logger } from "./services/logger";
import { config } from "./config/environment";
import {
  setupProductionEnvironment,
  getProductionPort,
} from "./production-startup";
import { logService } from "./services/log-service";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { executeScheduledPost } from "./services/social-scheduler";
import { DatabaseStorage } from "./database-storage";

// =====================================
// 🚀 REQUISOR STARTUP SEQUENCE
// =====================================
console.log("\n🔧 ===== DEPENDENCIES READY =====");

// Detect environment and setup
const isProduction = process.env.NODE_ENV === "production";
console.log(`✅ Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
console.log(`✅ Node.js version: ${process.version}`);
console.log(
  `✅ DATABASE_URL: ${process.env.DATABASE_URL ? "CONFIGURED" : "MISSING"}`,
);
console.log(
  `✅ OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "CONFIGURED" : "MISSING"}`,
);

// Setup production environment if needed
if (isProduction) {
  try {
    setupProductionEnvironment();
    console.log(`✅ Production environment: CONFIGURED`);
  } catch (error: any) {
    console.error("❌ Production setup failed:", error);
    process.exit(1);
  }
}

console.log("\n⚙️ ===== CONFIGURATION READY =====");

// CrewAI service is external - no local process management needed
console.log("🌐 CrewAI service: External backend service");

const app = express();

// Set appropriate trust proxy setting for the environment
app.set("trust proxy", isProduction ? 1 : false);

// Set Content Security Policy
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "connect-src 'self' blob: https://cdn.jsdelivr.net https://*.twitter.com https://*.facebook.com https://*.linkedin.com https://*.instagram.com https://api.stripe.com https://js.stripe.com https://m.stripe.network https://r.stripe.com; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.twitter.com https://*.facebook.com https://*.linkedin.com https://*.instagram.com https://js.stripe.com https://m.stripe.network; " +
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.network; " +
      "img-src 'self' data: https: blob:; " +
      "font-src 'self' data: https://fonts.gstatic.com;"
  );
  next();
});

// DEBUG: Log ALL incoming requests FIRST
app.use((req, res, next) => {
  console.log(`\n[DEBUG REQUEST] ${req.method} ${req.path}`);
  console.log(`[DEBUG REQUEST] Content-Type: ${req.headers["content-type"]}`);
  console.log(`[DEBUG REQUEST] Body keys:`, Object.keys(req.body || {}));
  next();
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10, // Max 10 files
    fieldSize: 10 * 1024 * 1024, // 10MB field size
    fieldNameSize: 100,
    fields: 50,
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types for now, validation happens in routes
    cb(null, true);
  },
});

// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Add multer middleware conditionally - only for routes that need it
// Don't apply to all routes to prevent form parsing errors

// Stripe webhook needs raw body for signature verification — register before JSON parser
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }));

// Body parsers - MUST skip multipart/form-data (used by file uploads with Multer)
app.use((req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    console.log(
      "[Body Parser] Skipping for multipart/form-data request:",
      req.path,
    );
    return next();
  }
  if (req.path === "/api/stripe/webhook") {
    return next();
  }
  express.json({ limit: "50mb" })(req, res, (err) => {
    if (err) return next(err);
    express.urlencoded({ extended: true, limit: "50mb" })(req, res, next);
  });
});

// Add cache-busting headers to prevent caching issues
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    // API responses - no cache
    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
  } else if (req.path.includes("/assets/")) {
    // Static assets - long cache with versioning
    res.set({
      "Cache-Control": "public, max-age=31536000", // 1 year
      ETag: `"${Date.now()}"`, // Force unique etag
    });
  }
  next();
});

// Basic request logging for /api. Deliberately logs only method/path/status/
// duration — never response bodies, which can contain user PII, payment URLs,
// and upstream error messages that embed credentials.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  try {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      uptime: process.uptime(),
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: "Health check failed",
    });
  }
});

(async () => {
  try {
    // Database connection and setup
    console.log("🔌 Setting up database connection...");
    logService.log("NODE", "INFO", "🔌 Setting up database connection...");
    const { setupDatabase } = await import("./db-setup");
    await setupDatabase();
    console.log("✅ Database: CONNECTED & CONFIGURED");
    logService.log("NODE", "INFO", "✅ Database: CONNECTED & CONFIGURED");

    // Reschedule pending posts
    console.log("\n⏰ ===== RESCHEDULING PENDING POSTS =====");
    try {
      const storage = new DatabaseStorage();
      const allPosts = await storage.getAllScheduledSocialPosts();
      const pendingPosts = allPosts.filter(p => p.status === 'scheduled');

      console.log(`⏰ Found ${pendingPosts.length} pending scheduled posts`);

      const now = new Date();
      let rescheduledCount = 0;

      for (const post of pendingPosts) {
        if (!post.scheduledTime) continue;

        const scheduledTime = new Date(post.scheduledTime);
        const delay = scheduledTime.getTime() - now.getTime();

        if (delay > 0) {
          console.log(`⏰ Rescheduling post ${post.id} for ${scheduledTime.toISOString()} (in ${Math.round(delay / 1000)}s)`);
          setTimeout(async () => {
            await executeScheduledPost(post);
          }, delay);
          rescheduledCount++;
        } else {
          console.log(`⏰ Post ${post.id} missed schedule (${scheduledTime.toISOString()}), executing immediately`);
          // Execute immediately if missed
          executeScheduledPost(post).catch(err => console.error(`❌ Failed to execute missed post ${post.id}:`, err));
          rescheduledCount++;
        }
      }
      console.log(`✅ Rescheduled/Executed ${rescheduledCount} posts`);
    } catch (error) {
      console.error("❌ Failed to reschedule posts:", error);
    }

    console.log("\n🌐 ===== PORTS READY =====");

    // Use environment-aware port configuration from centralized config
    const PORT = config.ports.server;
    console.log(`✅ Node.js server port: ${PORT} (READY)`);
    console.log(
      `✅ Separate service architecture: Node.js server + Python CrewAI service`,
    );

    // Setup static file serving - static assets first
    console.log("\n📁 ===== SETTING UP STATIC FILES =====");
    const distPath = path.join(process.cwd(), "dist/public");
    const indexPath = path.join(distPath, "index.html");
    
    if (isProduction) {
      console.log("📁 Setting up production static file serving...");
      app.use("/assets", express.static(path.join(process.cwd(), "dist/public/assets"), {
        maxAge: "1y",
        immutable: true,
      }));
      app.use(express.static(path.join(process.cwd(), "dist/public"), {
        maxAge: 0,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          }
        },
      }));
      console.log("✅ Static files: PRODUCTION MODE");
    } else {
      if (fs.existsSync(distPath) && fs.existsSync(indexPath)) {
        console.log("📁 Development mode: Serving built files");
        app.use(express.static(distPath));
        console.log("✅ Static files: DEVELOPMENT MODE");
      } else {
        console.log("⚠️  No built files found - run 'npm run build' first");
      }
    }

    // Register API routes BEFORE the SPA catch-all
    console.log("\n🔗 ===== REGISTERING APIS =====");
    await registerRoutes(app);
    console.log("✅ API Routes: REGISTERED & ACTIVE");

    // SEO: list of route prefixes that should NOT be indexed by search
    // engines. Public marketing pages ("/", "/team", "/pricing", etc.) are
    // intentionally excluded so they remain indexable.
    const NOINDEX_PREFIXES = [
      "/auth",
      "/dashboard",
      "/admin",
      "/brain",
      "/meetings",
      "/conversations",
      "/evidence",
      "/profile",
      "/reset-password",
      "/projects",
      "/project",
      "/settings",
      "/onboarding",
      "/agents",
      "/agent",
      "/build",
      "/plan",
      "/discoveries",
    ];
    const shouldNoIndex = (p: string) =>
      NOINDEX_PREFIXES.some(
        (pref) => p === pref || p.startsWith(pref + "/"),
      );

    // SPA catch-all route - must be AFTER API routes
    if (isProduction) {
      app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/media")) return next();
        if (shouldNoIndex(req.path)) {
          res.setHeader("X-Robots-Tag", "noindex, nofollow");
        }
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.sendFile(path.join(process.cwd(), "dist/public/index.html"));
      });
    } else {
      if (fs.existsSync(distPath) && fs.existsSync(indexPath)) {
        app.get("*", (req, res, next) => {
          if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/media")) return next();
          if (shouldNoIndex(req.path)) {
            res.setHeader("X-Robots-Tag", "noindex, nofollow");
          }
          res.sendFile(indexPath);
        });
      } else {
        app.get("*", (req, res, next) => {
          if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/media")) return next();
          res.status(500).send("Application not built. Run 'npm run build' first.");
        });
      }
    }
    console.log("✅ Authentication: CONFIGURED");
    console.log("✅ Middleware: LOADED");

    // Start the server - PORT OPENS IMMEDIATELY
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Node.js server: LISTENING on port ${PORT}`);
      logService.log(
        "NODE",
        "INFO",
        `✅ Node.js server: LISTENING on port ${PORT}`,
      );
      console.log(`🚀 Frontend available at: http://0.0.0.0:${PORT}`);

      // CrewAI runs as external service - Node.js forwards requests to it
      console.log(`✅ CrewAI service: External backend service`);
      logService.log(
        "CREWAI",
        "INFO",
        "✅ CrewAI service: External backend service",
      );

      console.log("\n📡 ===== ALL SYSTEMS OPERATIONAL =====");
      console.log("✅ Dependencies: READY");
      console.log("✅ Ports: READY & LISTENING");
      console.log("✅ Configuration: READY");
      console.log("✅ APIs: READY & RESPONDING");

      // Background initialization runs AFTER port is open
      setImmediate(async () => {
        console.log("\n🎯 ===== BACKGROUND TASKS =====");
        await backgroundInitialization();
      });
    });
  } catch (error) {
    console.error("\n💥 ===== STARTUP FAILED =====");
    console.error("❌ Critical startup error:", error);
    process.exit(1);
  }
})();

// Move background tasks to separate function outside the main block
async function backgroundInitialization() {
  // Seed initial data
  console.log("🌱 Seeding database with initial data...");
  await seedData();
  console.log("✅ Database seeding: COMPLETED");

  // Start cron scheduler
  console.log("⏰ Starting cron scheduler...");
  const { cronScheduler } = await import("./services/cron-scheduler");
  cronScheduler.start();
  console.log("✅ Cron scheduler: ACTIVE");

  // Start the meeting-intelligence background worker. Drains queued
  // transcripts (single-shot + bulk batches) and writes structured MOM
  // extractions. Idempotent — safe to call once per boot.
  console.log("🧠 Starting meeting-intelligence worker...");
  const { startIntelligenceWorker } = await import(
    "./services/meeting-intelligence-service"
  );
  startIntelligenceWorker({ concurrency: 5 });
  console.log("✅ Meeting-intelligence worker: ACTIVE");

  // Task #92: Start the RAG embedding worker. Polls every 30s for
  // unembedded evidence / conversations / feature candidates / insights and
  // writes vectors into the `embeddings` table. No-op if GEMINI_API_KEY
  // is not set (logged once on first pass).
  try {
    const { startEmbeddingWorker } = await import("./services/embeddings");
    startEmbeddingWorker(30_000);
    console.log("✅ Embedding worker: ACTIVE");
  } catch (err) {
    console.warn("⚠️  Embedding worker failed to start:", (err as any)?.message || err);
  }

  console.log("\n🎉 ===== REQUISOR FULLY OPERATIONAL =====");
  console.log("🚀 All systems ready and running!");

  // CrewAI runs as external service - Node.js forwards all requests to it
  console.log("\n✅ ===== EXTERNAL CREWAI SERVICE CONFIGURED =====");
  console.log("🔧 CrewAI content generation handled by external backend service");
}

// CrewAI is now integrated directly - no separate monitoring needed

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Global error handler
// Report unhandled route errors to Sentry (no-op without SENTRY_DSN),
// then respond via the global handler below.
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Global error handler:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Server startup is now handled inside the async function above