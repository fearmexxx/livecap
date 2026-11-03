import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_HALL,
  AUTH_COOKIE,
  canUseHall,
  getAuthSecret,
  isAuthEnabled,
  isHostedWithoutLogins,
  isValidViewKey,
  verifySession,
} from "@/lib/caption/hostedAuth";

/**
 * Hosted mode gate (only when hall passwords are configured, see hostedAuth.ts).
 * - Console pages and every API need a login; a hall login is kept on its own hall.
 * - Output pages (LED / overlay / window) and the caption feed also open with the hall's view key.
 */
const OUTPUT_PAGES = new Set([
  "/caption/led",
  "/caption/overlay",
  "/caption/window",
  "/led",
  "/overlay",
  "/window",
]);

export async function proxy(req: NextRequest) {
  if (isHostedWithoutLogins()) {
    return new NextResponse("LiveCap has no logins configured. Set LIVECAP_HALL_PASSWORDS in Vercel (see VERCEL_SETUP.md).", {
      status: 503,
    });
  }
  if (!isAuthEnabled()) return NextResponse.next();

  const { pathname, searchParams } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();

  const secret = await getAuthSecret();
  const auth = await verifySession(req.cookies.get(AUTH_COOKIE)?.value, secret);
  const isApi = pathname.startsWith("/api/");
  const hall = (searchParams.get("session") || "default").trim() || "default";

  // Read-only views: login for this hall, or the hall's private view key
  const isFeed = pathname === "/api/caption/sync" && req.method === "GET" && searchParams.get("action") !== "list-sessions";
  if (OUTPUT_PAGES.has(pathname) || isFeed) {
    if (canUseHall(auth, hall) || (await isValidViewKey(hall, searchParams.get("k"), secret))) {
      return NextResponse.next();
    }
    return deny(req, isApi);
  }

  if (!auth) return deny(req, isApi);

  // Keep a hall login on its own hall's console
  if (!isApi && auth.hall !== ADMIN_HALL && pathname.startsWith("/caption") && hall !== auth.hall) {
    const url = req.nextUrl.clone();
    url.searchParams.set("session", auth.hall);
    return NextResponse.redirect(url);
  }
  if (!isApi && auth.hall !== ADMIN_HALL && pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/caption";
    url.search = `?session=${encodeURIComponent(auth.hall)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function deny(req: NextRequest, isApi: boolean) {
  if (isApi) {
    return NextResponse.json({ error: "Please log in to LiveCap again.", loginRequired: true }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own assets and public files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?|txt)$).*)"],
};
