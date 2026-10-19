import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/offline",
  "/manifest.webmanifest",
  "/sw.js",
]);

// Signs people in at the edge. What they may see inside a school is decided
// per request from their membership (lib/auth/context), not here.
// Pages whose HTML carries no learner data and may be kept on the device for
// offline use (public/sw.js only caches responses marked like this).
const OFFLINE_SHELL = /^\/s\/[^/]+\/desk\/?$/;

export default clerkMiddleware(async (auth, request) => {
  if (!isPublic(request)) await auth.protect();
  if (OFFLINE_SHELL.test(request.nextUrl.pathname)) {
    const response = NextResponse.next();
    response.headers.set("x-offline-shell", "1");
    return response;
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
