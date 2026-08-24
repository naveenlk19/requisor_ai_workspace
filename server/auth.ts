import type { Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { v4 as uuidv4 } from "uuid";
import { pool } from "./db";
import { storage } from "./storage";

const PostgresSessionStore = connectPg(session);

// Custom authentication middleware with enhanced retry logic
// export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
//   console.log('Auth middleware - Session ID:', req.sessionID);
//   console.log('Auth middleware - Session userId:', req.session?.userId);

//   // Check for session with userId
//   if (req.session && req.session.userId) {
//     try {
//       // Get the user data and attach it to the request
//       const user = await storage.getUser(req.session.userId);
//       if (user) {
//         // Set user object on request to match expected format in routes
//         (req as any).user = {
//           id: user.id,
//           dbUserId: user.id,
//           claims: { sub: user.id },
//           ...user
//         };
//         console.log('Authentication successful for user:', user.id);
//         return next();
//       } else {
//         console.log('User not found in database for session userId:', req.session.userId);
//         // Clear invalid session
//         req.session.destroy(() => {});
//         return res.status(401).json({ message: 'User not found - Please log in again' });
//       }
//     } catch (error) {
//       console.error('Error fetching user in authentication middleware:', error);
//       return res.status(401).json({ message: 'Authentication error - Please log in again' });
//     }
//   }

//   // Check for OAuth user on request (for OAuth callbacks)
//   if ((req as any).user && (req as any).user.id) {
//     try {
//       const user = await storage.getUser((req as any).user.id);
//       if (user) {
//         (req as any).user = {
//           id: user.id,
//           dbUserId: user.id,
//           claims: { sub: user.id },
//           ...user
//         };
//         console.log('OAuth authentication successful for user:', user.id);
//         return next();
//       }
//     } catch (error) {
//       console.error('Error with OAuth user lookup:', error);
//     }
//   }

//   console.log('No valid session or OAuth user found');
//   res.status(401).json({ message: 'Not authenticated - Please log in' });
// };

// Replace your current isAuthenticated with this:

export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Prefer Passport's state first
    const passportId = (req.session as any)?.passport?.user as
      | string
      | undefined;
    const candidateUserId =
      req.session?.userId || passportId || (req as any)?.user?.id;

    if (!candidateUserId) {
      console.log("No valid session or OAuth user found");
      return res
        .status(401)
        .json({ message: "Not authenticated - Please log in" });
    }

    const user = await storage.getUser(candidateUserId);
    if (!user) {
      console.log("User not found in database for id:", candidateUserId);
      req.session?.destroy(() => {});
      return res
        .status(401)
        .json({ message: "User not found - Please log in again" });
    }

    // Normalize req.user for downstream code
    (req as any).user = {
      id: user.id,
      dbUserId: user.id,
      claims: { sub: user.id },
      ...user,
    };

    // Keep a copy for your custom logic (optional)
    if (!req.session.userId) req.session.userId = user.id;

    console.log("Authentication successful for user:", user.id);
    return next();
  } catch (error) {
    console.error("Error in authentication middleware:", error);
    return res
      .status(401)
      .json({ message: "Authentication error - Please log in again" });
  }
};

// Setup OAuth strategies
export function setupOAuth(app: any) {
  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: "/api/callback",
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            // Check if user exists
            let user = await storage.getUserByEmail(
              profile.emails?.[0]?.value || "",
            );

            if (!user) {
              // Create new user with 10-character unique ID
              user = await storage.createUser({
                id: uuidv4(),
                username:
                  profile.displayName || profile.emails?.[0]?.value || "",
                email: profile.emails?.[0]?.value || null,
                firstName: profile.name?.givenName || null,
                lastName: profile.name?.familyName || null,
                bio: null,
                profileImageUrl: profile.photos?.[0]?.value || null,
                stripeCustomerId: null,
                stripeSubscriptionId: null,
                subscriptionPlan: "starter",
                subscriptionStatus: "active",
              });
            }

            return done(null, user);
          } catch (error) {
            return done(error, undefined);
          }
        },
      ),
    );
  }

  // GitHub OAuth Strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: "/api/auth/github/callback",
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            // Check if user exists
            let user = await storage.getUserByEmail(
              profile.emails?.[0]?.value || "",
            );

            if (!user) {
              // Create new user with 10-character unique ID
              user = await storage.createUser({
                id: uuidv4(),
                username: profile.username || profile.displayName || "",
                email: profile.emails?.[0]?.value || null,
                firstName:
                  profile.name?.givenName || profile.displayName || null,
                lastName: profile.name?.familyName || null,
                bio: profile._json?.bio || null,
                profileImageUrl: profile.photos?.[0]?.value || null,
                stripeCustomerId: null,
                stripeSubscriptionId: null,
                subscriptionPlan: "starter",
                subscriptionStatus: "active",
              });
            }

            return done(null, user);
          } catch (error) {
            return done(error, undefined);
          }
        },
      ),
    );
  }

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  app.use(passport.initialize());
  app.use(passport.session());
}

// Setup session middleware
export function setupSession(app: any) {
  app.set("trust proxy", 1); // important behind proxies / platforms
  const sessionStore = new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
    tableName: "sessions",
    schemaName: "public",
  });

  // Fail fast everywhere, not just production: a known fallback secret would
  // make every session cookie forgeable in any deployed environment
  // (staging, previews). Local setup: see runlocal.md (`openssl rand -hex 32`).
  if (!process.env.SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET must be set (generate one with: openssl rand -hex 32)",
    );
  }

  const sessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false, // was true
    saveUninitialized: false, // was true
    rolling: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // true in prod when behind HTTPS
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year, matching the pre-migration session lifetime
      sameSite: "lax",
    },
    name: "connect.sid",
  });

  app.use(sessionMiddleware);
}

// Full auth setup: session + OAuth strategies + login/callback/logout routes.
// Serves the same endpoint paths the app has always used (/api/login,
// /api/callback, /api/logout) so no client code changes are needed.
export async function setupAuth(app: any) {
  setupSession(app);
  setupOAuth(app);

  app.get("/api/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("google", {
      scope: ["profile", "email"],
      prompt: "select_account",
    })(req, res, next);
  });

  app.get(
    "/api/callback",
    (req: Request, res: Response, next: NextFunction) => {
      passport.authenticate(
        "google",
        (err: Error | null, user: Express.User | false) => {
          if (err || !user) {
            console.error("Authentication error in callback:", err);
            return res.redirect("/api/login");
          }
          req.login(user, (loginErr) => {
            if (loginErr) {
              console.error("Login error:", loginErr);
              return res.redirect("/api/login");
            }
            req.session.userId = (user as any).id;
            // Redirect back to a pending OAuth authorize request
            // (Task #133 MCP one-click connect) or home.
            const returnTo = (req.session as any)?.oauthReturnTo;
            if (
              typeof returnTo === "string" &&
              returnTo.startsWith("/") &&
              !returnTo.startsWith("//")
            ) {
              delete (req.session as any).oauthReturnTo;
              return res.redirect(returnTo);
            }
            return res.redirect("/");
          });
        },
      )(req, res, next);
    },
  );

  app.get(
    "/api/auth/github",
    (req: Request, res: Response, next: NextFunction) => {
      passport.authenticate("github", { scope: ["user:email"] })(
        req,
        res,
        next,
      );
    },
  );

  app.get(
    "/api/auth/github/callback",
    (req: Request, res: Response, next: NextFunction) => {
      passport.authenticate(
        "github",
        (err: Error | null, user: Express.User | false) => {
          if (err || !user) {
            console.error("GitHub authentication error:", err);
            return res.redirect("/api/login");
          }
          req.login(user, (loginErr) => {
            if (loginErr) return res.redirect("/api/login");
            req.session.userId = (user as any).id;
            return res.redirect("/");
          });
        },
      )(req, res, next);
    },
  );

  app.get("/api/logout", (req: Request, res: Response) => {
    req.logout(() => {
      req.session.destroy((err: Error | null) => {
        if (err) {
          console.error("Session destruction error:", err);
        }
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  });
}

// Extend session interface
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}
