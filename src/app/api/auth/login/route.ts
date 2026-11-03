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

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.json({ ok: true, hall: null });
  const body = await req.json().catch(() => ({}));
  const hall = String(body.hall || "").trim().toLowerCase();
  const granted = checkPassword(hall, String(body.password || ""));
  if (!granted) {
    // Slow down password guessing
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Wrong password for this hall." }, { status: 401 });
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
