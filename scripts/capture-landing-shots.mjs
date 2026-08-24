// One-off script: captures real, authenticated screenshots of the in-app
// product surfaces and writes them to client/public/landing/. Used so the
// public landing page can show genuine product UI instead of mockups.
//
//   Setup (puppeteer is intentionally NOT a runtime dependency):
//     npm install --no-save puppeteer
//
//   Run:
//     CAPTURE_EMAIL=you@example.com CAPTURE_PASSWORD=*** \
//       node scripts/capture-landing-shots.mjs
//
//   Requires the dev server to be running (default http://localhost:8080).

import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.CAPTURE_BASE || "http://localhost:8080";
const OUT_DIR = path.resolve("client/public/landing");
const EMAIL = process.env.CAPTURE_EMAIL;
const PASSWORD = process.env.CAPTURE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "[shots] FATAL: CAPTURE_EMAIL and CAPTURE_PASSWORD env vars are required.",
  );
  console.error(
    "[shots] Example:  CAPTURE_EMAIL=you@example.com CAPTURE_PASSWORD=*** \\",
  );
  console.error("[shots]            node scripts/capture-landing-shots.mjs");
  process.exit(2);
}

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };
const SHOT_WIDTH = 1280;
const SHOT_HEIGHT = 800;

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log("[shots] launching browser…");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // 1) Log in via API to obtain a session cookie
    console.log(`[shots] logging in as ${EMAIL}`);
    const loginPage = await browser.newPage();
    await loginPage.goto(BASE, { waitUntil: "domcontentloaded" });
    const loginResp = await loginPage.evaluate(
      async (base, email, password) => {
        const r = await fetch(`${base}/api/auth/login`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        return { status: r.status, body: await r.text() };
      },
      BASE,
      EMAIL,
      PASSWORD,
    );
    if (loginResp.status >= 400) {
      throw new Error(`Login failed (${loginResp.status}): ${loginResp.body}`);
    }
    console.log(`[shots] login OK (${loginResp.status})`);
    await loginPage.close();

    // 2) Capture each in-app surface
    const targets = [
      { slug: "context-brain", route: "/brain", waitFor: 2500 },
      { slug: "past-discoveries", route: "/past-discoveries", waitFor: 2500 },
      { slug: "meetings", route: "/meetings", waitFor: 2500 },
      { slug: "build-mode", route: "/dashboard", waitFor: 2500 },
      { slug: "plan-mode", route: "/projects", waitFor: 2500 },
    ];

    for (const t of targets) {
      const file = path.join(OUT_DIR, `${t.slug}.png`);
      console.log(`[shots] ${t.route} → ${file}`);
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      // Pre-warm: hit the route once so the origin matches, then disable
      // the first-run onboarding tour via localStorage before the real load.
      await page.goto(`${BASE}${t.route}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.evaluate(() => {
        try {
          localStorage.setItem("requisor_onboarding_completed", "true");
        } catch {}
      });
      await page.goto(`${BASE}${t.route}`, {
        waitUntil: "networkidle2",
        timeout: 30_000,
      });
      await new Promise((r) => setTimeout(r, t.waitFor));
      // Best-effort: dismiss any visible modal close button still on screen.
      await page.evaluate(() => {
        const closeBtn = document.querySelector(
          'button[aria-label="Close"], button[aria-label="Dismiss"], [data-state="open"] [data-radix-dialog-close]',
        );
        if (closeBtn instanceof HTMLElement) closeBtn.click();
      });
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({
        path: file,
        type: "png",
        clip: { x: 0, y: 0, width: SHOT_WIDTH, height: SHOT_HEIGHT },
      });
      await page.close();
    }

    // 3) Capture og.png from the public landing hero (1200x630 social card)
    console.log("[shots] / (landing hero) → og.png");
    const og = await browser.newPage();
    await og.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
    // Visit landing in a fresh context (no cookie) so the public hero renders
    const ogContext = await browser.createBrowserContext();
    const ogPage = await ogContext.newPage();
    await ogPage.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
    await ogPage.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1500));
    await ogPage.screenshot({
      path: path.join(OUT_DIR, "og.png"),
      type: "png",
      clip: { x: 0, y: 0, width: 1200, height: 630 },
    });
    await ogContext.close();
    await og.close();

    console.log("[shots] done.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[shots] FAILED:", err);
  process.exit(1);
});
