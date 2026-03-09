import { NextResponse } from "next/server";

/**
 * Middleware Configuration
 *
 * This middleware handles:
 * 2. Public API access - allows /api/stubs/* for external API calls
 * 3. Route exclusions - skips static files and internal routes
 */

// Define paths that should be accessible to everyone
const publicPaths = [
  "/",
  "/numbers",
  "/wallet",
  "/profile",
  "/support",
  "/transactions",
  "/api/stubs",
  "/api/trpc", // tRPC routes have their own auth middleware
];

/**
 * Check if a path is public (doesn't require admin protection)
 */
function isPublicPath(pathname: string): boolean {
  // Check exact matches
  if (publicPaths.includes(pathname)) {
    return true;
  }

  // Check if starts with any public path prefix
  return publicPaths.some(path => pathname.startsWith(path + "/"));
}

/**
 * Main middleware function
 */
export function proxy(request: Request) {
  // Get the pathname from the request URL
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Check if this is an admin route request
  if (pathname.startsWith("/admin")) {
    // Check if user has a valid session
    const sessionCookie = request.headers.get("cookie");

    // Better Auth uses better-auth.session cookie
    const hasSession = sessionCookie?.includes("better-auth.session");

    if (!hasSession) {
      // No session - redirect to home
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Note: The isAdmin check is done on the server side
    // in the admin router's adminProcedure middleware
    // The middleware just ensures a session exists
  }

  // Allow all other requests to pass through
  return NextResponse.next();
}

/**
 * Middleware configuration
 *
 * Matcher defines which routes the middleware runs on:
 * - Excludes /api/* routes (tRPC and auth have their own middleware)
 * - Excludes /api/stubs/* (public API for external access)
 * - Excludes static files and images
 * - Excludes Next.js internal routes
 */
export const config = {
  // Run middleware on all routes except:
  // - API routes (tRPC, auth, stubs)
  // - Static files
  // - Images
  // - Internal Next.js routes
  matcher: [
    // Exclude API routes, static files, images, and internal routes
    "/((?!api|_next/static|_next/image|.*\\.png$).*)",
  ],
};
