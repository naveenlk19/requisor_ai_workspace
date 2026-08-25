import { Router } from "express";
import { DatabaseStorage } from "../database-storage";
import multer from "multer";
import FormData from "form-data";
import axios from "axios";
import { nanoid } from "nanoid";
import { logService } from "../services/log-service";

const router = Router();
const storage = new DatabaseStorage();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit per file
});

// Facebook Graph API version
const FB_API_VERSION = "v21.0";

/**
 * Resolve the user's Facebook access token from session or DB (refreshing it
 * when close to expiry). Page tokens are always derived server-side from this
 * token — they are never accepted from, or returned to, the browser.
 */
async function getUserFacebookToken(req: any, userId: string): Promise<string | null> {
  let accessToken = req.session.facebookAccessToken;
  if (accessToken) return accessToken;

  const accounts = await storage.getSocialMediaAccounts(userId);
  const facebookAccount = accounts.find(
    (acc) => acc.platform === "facebook" && acc.isActive,
  );
  if (!facebookAccount || !facebookAccount.accessToken) return null;

  // Proactive refresh check: refresh if < 3 days to expiry (same logic as service)
  if (facebookAccount.tokenExpiresAt) {
    const timeDiff = new Date(facebookAccount.tokenExpiresAt).getTime() - Date.now();
    if (timeDiff < 3 * 24 * 60 * 60 * 1000) {
      logService.log("NODE", "INFO", "[Facebook] Token expiring soon, refreshing...");
      try {
        const exchangeUrl = `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token?` +
          `grant_type=fb_exchange_token&` +
          `client_id=${process.env.FACEBOOK_APP_ID}&` +
          `client_secret=${process.env.FACEBOOK_APP_SECRET}&` +
          `fb_exchange_token=${facebookAccount.accessToken}`;

        const response = await fetch(exchangeUrl);
        const data = await response.json();

        if (data.access_token) {
          facebookAccount.accessToken = data.access_token;
          const newExpiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined;
          await storage.updateSocialMediaAccount(facebookAccount.id, {
            accessToken: data.access_token,
            tokenExpiresAt: newExpiry,
          });
          logService.log("NODE", "INFO", "[Facebook] Token refreshed successfully");
        }
      } catch (e: any) {
        // Never log the raw error: an exchange failure can echo the request
        // URL, which embeds client_secret and the old token.
        logService.log("NODE", "ERROR", "[Facebook] Failed to refresh token", { message: e?.message });
      }
    }
  }

  accessToken = facebookAccount.accessToken;
  req.session.facebookAccessToken = accessToken;
  req.session.facebookUserId = facebookAccount.accountId;
  return accessToken;
}

/**
 * Look up one page's access token server-side via /me/accounts.
 */
async function getPageAccessToken(userToken: string, pageId: string): Promise<string | null> {
  const pagesUrl = `https://graph.facebook.com/${FB_API_VERSION}/me/accounts?access_token=${userToken}`;
  const pagesResponse = await fetch(pagesUrl);
  const pagesData = (await pagesResponse.json()) as any;
  if (!pagesResponse.ok || pagesData.error) return null;
  const page = (pagesData.data || []).find((p: any) => String(p.id) === String(pageId));
  return page?.access_token || null;
}

// Log when this module is loaded
logService.log(
  "NODE",
  "INFO",
  "[Facebook Social Routes] Module loaded successfully",
);

// Test route to verify routing works
router.get("/test", (req, res) => {
  logService.log("NODE", "INFO", "[Facebook Social Routes] Test route hit!");
  res.json({ success: true, message: "Facebook social routes are working" });
});

/**
 * Check Facebook connection status and fetch user's pages
 * Returns whether the user has connected Facebook and their available pages
 */
router.get("/facebook/status", async (req: any, res) => {
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
      return res.json({
        success: true,
        connected: false,
        message: "User not authenticated",
      });
    }

    const userId = req.user.dbUserId || req.user.claims?.sub;
    if (!userId) {
      return res.json({
        success: true,
        connected: false,
        message: "User ID not found",
      });
    }

    // Get Facebook access token (session → DB, with proactive refresh)
    const accessToken = await getUserFacebookToken(req, userId);

    if (!accessToken) {
      return res.json({
        success: true,
        connected: false,
        message: "No Facebook account connected",
      });
    }

    // Fetch user's Facebook Pages
    try {
      const pagesUrl = `https://graph.facebook.com/${FB_API_VERSION}/me/accounts?access_token=${accessToken}`;
      const pagesResponse = await fetch(pagesUrl);
      const pagesData = await pagesResponse.json();

      logService.log("NODE", "INFO", "[Facebook Status] Pages API response:", {
        ok: pagesResponse.ok,
        status: pagesResponse.status,
        hasData: !!pagesData.data,
        pagesCount: pagesData.data?.length || 0,
        firstPageHasToken: pagesData.data?.[0]?.access_token ? true : false,
        error: pagesData.error,
      });

      if (!pagesResponse.ok || pagesData.error) {
        logService.log(
          "NODE",
          "ERROR",
          "[Facebook Status] Failed to fetch pages:",
          pagesData.error,
        );
        return res.json({
          success: true,
          connected: true,
          pages: [],
          message: "Connected but no pages available",
          debug: pagesData.error,
        });
      }

      const pages = pagesData.data || [];

      return res.json({
        success: true,
        connected: true,
        // Page access tokens stay server-side: /facebook/publish resolves the
        // page token itself from the page id. Never ship tokens to the browser.
        pages: pages.map((page: any) => ({
          id: page.id,
          name: page.name,
        })),
        debug: {
          pagesCount: pages.length,
        },
      });
    } catch (fetchError: any) {
      logService.log(
        "NODE",
        "ERROR",
        "[Facebook Status] Error fetching pages:",
        fetchError,
      );
      return res.json({
        success: true,
        connected: true,
        pages: [],
        message: "Connected but couldn't fetch pages",
      });
    }
  } catch (error: any) {
    logService.log(
      "NODE",
      "ERROR",
      "[Facebook Status] Error checking status:",
      error,
    );
    return res.status(500).json({
      success: false,
      error: "Failed to check Facebook connection status",
      message: error.message,
    });
  }
});

/**
 * Publish a post to a Facebook Page with optional media (images/videos)
 * POST /api/social/facebook/publish
 * Body: { content: string, pageId: string, pageAccessToken: string, linkUrl?: string }
 * Files: media[] (optional images/videos)
 */
logService.log(
  "NODE",
  "INFO",
  "[Facebook Social Routes] Registering POST /facebook/publish route",
);

// Add middleware to log ALL requests to this route
router.post(
  "/facebook/publish",
  (req, res, next) => {
    console.log("[Facebook Publish] PRE-MULTER - Request received!");
    logService.log(
      "NODE",
      "INFO",
      "[Facebook Publish] PRE-MULTER - Request received!",
    );
    logService.log(
      "NODE",
      "INFO",
      "[Facebook Publish] PRE-MULTER - Method:",
      req.method,
    );
    logService.log(
      "NODE",
      "INFO",
      "[Facebook Publish] PRE-MULTER - Content-Type:",
      req.headers["content-type"],
    );
    logService.log(
      "NODE",
      "INFO",
      "[Facebook Publish] PRE-MULTER - URL:",
      req.url,
    );
    next();
  },
  upload.array("media", 10),
  async (req: any, res) => {
    try {
      logService.log(
        "NODE",
        "INFO",
        "[Facebook Publish] === POST-MULTER - START REQUEST ===",
      );
      logService.log(
        "NODE",
        "INFO",
        "[Facebook Publish] Content-Type:",
        req.headers["content-type"],
      );
      logService.log(
        "NODE",
        "INFO",
        "[Facebook Publish] Body keys:",
        Object.keys(req.body || {}),
      );
      logService.log(
        "NODE",
        "INFO",
        "[Facebook Publish] Files count:",
        req.files?.length || 0,
      );
      logService.log(
        "NODE",
        "INFO",
        "[Facebook Publish] Files:",
        req.files?.map((f: any) => ({
          fieldname: f.fieldname,
          originalname: f.originalname,
          size: f.size,
          mimetype: f.mimetype,
        })),
      );

      // Check authentication
      if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        logService.log(
          "NODE",
          "INFO",
          "[Facebook Publish] Authentication failed",
        );
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      const userId = req.user.dbUserId || req.user.claims?.sub;
      const { content, pageId, linkUrl } = req.body;
      const mediaFiles = (req.files as any[]) || [];

      logService.log("NODE", "INFO", "[Facebook Publish] Parsed values:", {
        pageId,
        contentLength: content?.length || 0,
        linkUrl,
        mediaCount: mediaFiles.length,
        mediaFiles: mediaFiles.map((f) => ({
          name: f.originalname,
          size: f.size,
          type: f.mimetype,
        })),
      });

      if (!content || content.trim().length === 0) {
        logService.log(
          "NODE",
          "ERROR",
          "[Facebook Publish] ❌ Content is empty",
        );
        return res.status(400).json({
          success: false,
          error: "Content cannot be empty",
        });
      }

      if (!pageId) {
        logService.log(
          "NODE",
          "ERROR",
          "[Facebook Publish] ❌ Missing required fields:",
          { hasPageId: !!pageId },
        );
        return res.status(400).json({
          success: false,
          error: "Page ID is required",
        });
      }

      // Validate pageId is not "undefined" or "null" as string
      if (
        pageId === "undefined" ||
        pageId === "null" ||
        pageId === "0" ||
        String(pageId).trim() === ""
      ) {
        logService.log(
          "NODE",
          "ERROR",
          "[Facebook Publish] ❌ Invalid pageId:",
          pageId,
        );
        return res.status(400).json({
          success: false,
          error: `Invalid page ID: ${pageId}. Please select a valid Facebook page.`,
        });
      }

      // Resolve the page access token server-side — never accepted from the
      // browser (a page token in the client is XSS-harvestable).
      const userToken = await getUserFacebookToken(req, userId);
      if (!userToken) {
        return res.status(401).json({
          success: false,
          error: "Facebook account not connected. Please reconnect your Facebook account.",
        });
      }
      const pageAccessToken = await getPageAccessToken(userToken, pageId);
      if (!pageAccessToken) {
        return res.status(400).json({
          success: false,
          error: "Selected Facebook page not found or missing posting permission.",
        });
      }

      let postId: string;
      let facebookUrl: string;

      // Handle different posting scenarios based on media type
      if (mediaFiles.length === 0 && linkUrl) {
        // Text post with link
        const formData = new URLSearchParams();
        formData.append("message", content.trim());
        formData.append("link", linkUrl.trim());
        formData.append("access_token", pageAccessToken);

        const publishUrl = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/feed`;
        const response = await fetch(publishUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });

        const responseData = (await response.json()) as any;
        logService.log(
          "NODE",
          "INFO",
          "[Facebook Publish] Text+link post response:",
          {
            ok: response.ok,
            status: response.status,
            data: responseData,
          },
        );

        if (!response.ok)
          throw new Error(responseData.error?.message || "Failed to post");

        if (!responseData.id) {
          logService.log(
            "NODE",
            "ERROR",
            "[Facebook Publish] No post ID in response:",
            responseData,
          );
          throw new Error("Facebook did not return a post ID");
        }

        postId = responseData.id;
        facebookUrl = `https://www.facebook.com/${postId.replace("_", "/posts/")}`;
      } else if (mediaFiles.length === 1) {
        // Single image or video
        const file = mediaFiles[0];
        const isVideo = file.mimetype.startsWith("video/");
        const endpoint = isVideo ? "videos" : "photos";

        logService.log(
          "NODE",
          "INFO",
          `[Facebook Publish] Uploading single ${isVideo ? "video" : "photo"}...`,
        );
        logService.log("NODE", "INFO", `[Facebook Publish] Page details:`, {
          pageId,
          endpoint,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
        });

        const formData = new FormData();
        formData.append("message", content.trim());
        formData.append("access_token", pageAccessToken);
        formData.append(isVideo ? "source" : "source", file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });

        const uploadUrl = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/${endpoint}`;
        logService.log(
          "NODE",
          "INFO",
          `[Facebook Publish] Upload URL:`,
          uploadUrl,
        );

        const response = await axios.post(uploadUrl, formData, {
          headers: {
            ...formData.getHeaders(),
          },
        });

        const responseData = response.data;
        logService.log(
          "NODE",
          "INFO",
          `[Facebook Publish] Single media upload response:`,
          {
            ok: response.status === 200,
            status: response.status,
            data: responseData,
          },
        );

        if (response.status !== 200) {
          const errorMsg =
            responseData.error?.message || "Failed to upload media";
          logService.log(
            "NODE",
            "ERROR",
            "[Facebook Publish] Upload failed:",
            errorMsg,
          );
          throw new Error(errorMsg);
        }

        postId = responseData.id || responseData.post_id;
        logService.log("NODE", "INFO", "[Facebook Publish] Extracted post ID", {
          postId,
          response: responseData,
        });

        if (!postId) {
          logService.log(
            "NODE",
            "ERROR",
            "[Facebook Publish] No post ID in response. Full response:",
            JSON.stringify(responseData),
          );
          throw new Error("Facebook did not return a post ID");
        }

        // Ensure postId is valid (not 0, '0', null, or undefined)
        const postIdStr = String(postId);
        if (
          !postIdStr ||
          postIdStr === "0" ||
          postIdStr === "null" ||
          postIdStr === "undefined"
        ) {
          logService.log(
            "NODE",
            "ERROR",
            "[Facebook Publish] Invalid post ID:",
            postId,
          );
          throw new Error(`Invalid post ID received: ${postId}`);
        }

        facebookUrl = `https://www.facebook.com/${postIdStr.replace("_", "/posts/")}`;
        logService.log(
          "NODE",
          "INFO",
          "[Facebook Publish] Generated URL:",
          facebookUrl,
        );
      } else if (mediaFiles.length > 1) {
        // Multiple images (batch upload)
        logService.log(
          "NODE",
          "INFO",
          `[Facebook Publish] Uploading ${mediaFiles.length} photos...`,
        );

        // Step 1: Upload all photos and get their IDs
        const photoIds: string[] = [];

        for (const file of mediaFiles) {
          if (!file.mimetype.startsWith("image/")) {
            return res.status(400).json({
              success: false,
              error:
                "Multiple media uploads only support images. Videos must be posted individually.",
            });
          }

          const formData = new FormData();
          formData.append("access_token", pageAccessToken);
          formData.append("published", "false"); // Don't publish yet
          formData.append("source", file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
          });

          const uploadUrl = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/photos`;
          const response = await axios.post(uploadUrl, formData, {
            headers: {
              ...formData.getHeaders(),
            },
          });

          const responseData = response.data;
          if (response.status !== 200) {
            logService.log(
              "NODE",
              "ERROR",
              "[Facebook Publish] Photo upload error:",
              responseData,
            );
            throw new Error(
              responseData.error?.message || "Failed to upload photo",
            );
          }

          photoIds.push(responseData.id);
          logService.log(
            "NODE",
            "INFO",
            `[Facebook Publish] Uploaded photo ${photoIds.length}/${mediaFiles.length}: ${responseData.id}`,
          );
        }

        // Step 2: Create post with all photos
        const attachedMedia = photoIds.map((id) => ({ media_fbid: id }));
        const postData = new URLSearchParams();
        postData.append("message", content.trim());
        postData.append("attached_media", JSON.stringify(attachedMedia));
        postData.append("access_token", pageAccessToken);

        logService.log(
          "NODE",
          "INFO",
          "[Facebook Publish] Creating post with photos:",
          {
            pageId,
            photoIds,
            attachedMedia,
          },
        );

        const publishUrl = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/feed`;
        const response = await fetch(publishUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: postData.toString(),
        });

        const responseData = (await response.json()) as any;
        logService.log(
          "NODE",
          "INFO",
          "[Facebook Publish] Multi-photo post response:",
          {
            ok: response.ok,
            status: response.status,
            data: responseData,
          },
        );

        if (!response.ok) {
          logService.log(
            "NODE",
            "ERROR",
            "[Facebook Publish] Post creation error:",
            responseData,
          );
          throw new Error(
            responseData.error?.message || "Failed to create post with photos",
          );
        }

        if (!responseData.id) {
          logService.log(
            "NODE",
            "ERROR",
            "[Facebook Publish] No post ID in response:",
            responseData,
          );
          throw new Error("Facebook did not return a post ID");
        }

        postId = responseData.id;
        facebookUrl = `https://www.facebook.com/${postId.replace("_", "/posts/")}`;
      } else {
        // Text-only post
        const formData = new URLSearchParams();
        formData.append("message", content.trim());
        formData.append("access_token", pageAccessToken);

        const publishUrl = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/feed`;
        const response = await fetch(publishUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });

        const responseData = (await response.json()) as any;
        logService.log(
          "NODE",
          "INFO",
          "[Facebook Publish] Text-only post response:",
          {
            ok: response.ok,
            status: response.status,
            data: responseData,
          },
        );

        if (!response.ok)
          throw new Error(responseData.error?.message || "Failed to post");

        if (!responseData.id) {
          logService.log(
            "NODE",
            "ERROR",
            "[Facebook Publish] No post ID in response:",
            responseData,
          );
          throw new Error("Facebook did not return a post ID");
        }

        postId = responseData.id;
        facebookUrl = `https://www.facebook.com/${postId.replace("_", "/posts/")}`;
      }

      logService.log(
        "NODE",
        "INFO",
        `[Facebook Publish] ✅ Successfully published post: ${postId}`,
      );

      // Save to completed history
      try {
        if (userId) {
          const mediaUrls = mediaFiles.length > 0
            ? mediaFiles.map(f => f.originalname)
            : [];

          await storage.createCompletedSocialPost({
            id: nanoid(),
            userId,
            topic: content.substring(0, 50) + (content.length > 50 ? "..." : ""),
            platform: "Facebook",
            scheduledTime: new Date(),
            executedAt: new Date(),
            status: "completed",
            finalContent: content,
            mediaUrls,
            platformResponse: { postId, facebookUrl },
            userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        }
      } catch (historyError) {
        logService.log("NODE", "ERROR", "[Facebook Publish] Failed to save history:", historyError);
      }

      return res.json({
        success: true,
        url: facebookUrl,
        result: {
          postId: postId,
          facebookUrl: facebookUrl,
          message: "Successfully posted to Facebook",
          mediaCount: mediaFiles.length,
        },
      });
    } catch (error: any) {
      // Never log the raw error object: axios errors serialize with the
      // request config (Authorization headers, form data with access_token).
      logService.log("NODE", "ERROR", "[Facebook Publish] Error details:", {
        message: error.message,
        name: error.name,
        code: error.code,
      });

      // Handle specific Facebook API errors
      if (
        error.message?.includes("OAuthException") ||
        error.message?.includes("expired")
      ) {
        return res.status(401).json({
          success: false,
          error:
            "Facebook authentication expired. Please reconnect your Facebook account.",
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to publish to Facebook",
      });
    }
  },
);

export default router;
