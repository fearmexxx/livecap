import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/caption/hostedAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
