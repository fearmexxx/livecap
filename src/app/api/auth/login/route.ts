import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_HALL,
  AUTH_COOKIE,
  SESSION_DAYS,
  checkPassword,
  getAuthSecret,
  isAuthEnabled,
  signSession,
} from "@/lib/caption/hostedAuth";
import { getRoomBackend } from "@/lib/caption/roomBackend";

// Per network address, not per hall: the admin password works on any hall name, so a per-hall count
// could be dodged. Generous because every laptop on the venue Wi-Fi shares one address.
const MAX_FAILURES = 20;

function clientAddress(req: NextRequest): string {
  return req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.json({ ok: true, hall: null });
  const body = await req.json().catch(() => ({}));
  const hall = String(body.hall || "").trim().toLowerCase();
  const backend = getRoomBackend();
  const address = clientAddress(req);
  let granted: string | null;
  try {
    if ((await backend.loginFailures(address)) >= MAX_FAILURES) {
      return NextResponse.json({ error: "Too many wrong passwords. Wait 15 minutes and try again." }, { status: 429 });
    }
    granted = checkPassword(hall, String(body.password || ""));
    if (!granted) {
      await backend.recordLoginFailure(address);
      return NextResponse.json({ error: "Wrong password for this hall." }, { status: 401 });
    }
    await backend.clearLoginFailures(address);
  } catch {
    // Without storage the limit cannot hold, so refuse rather than allow unlimited guesses
    return NextResponse.json({ error: "Login is unavailable right now. Try again." }, { status: 503 });
  }
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const token = await signSession({ hall: granted, exp }, await getAuthSecret());
  const res = NextResponse.json({
    ok: true,
    hall: granted,
    redirect: granted === ADMIN_HALL ? "/caption?session=hall-1" : `/caption?session=${encodeURIComponent(granted)}`,
  });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
