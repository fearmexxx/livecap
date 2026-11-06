import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_HALL,
  getAuthSecret,
  isAuthEnabled,
  listHalls,
  sessionFromHeaders,
  viewKeyFor,
} from "@/lib/caption/hostedAuth";

/**
 * Who is logged in, plus the read-only view key for the hall being run, so the console can build
 * private LED / vMix / OBS links. `?session=hall-2` picks the hall (admin logins can pick any).
 */
export async function GET(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.json({ enabled: false });
  const auth = await sessionFromHeaders(req.headers);
  const halls = listHalls();
  if (!auth) return NextResponse.json({ enabled: true, loggedIn: false, halls });
  const requested = (req.nextUrl.searchParams.get("session") || "").trim();
  const hall = auth.hall === ADMIN_HALL ? requested || halls[0] || "hall-1" : auth.hall;
  return NextResponse.json(
    {
      enabled: true,
      loggedIn: true,
      admin: auth.hall === ADMIN_HALL,
      hall,
      halls,
      viewKey: await viewKeyFor(hall, await getAuthSecret()),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
