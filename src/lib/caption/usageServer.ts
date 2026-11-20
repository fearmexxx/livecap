import { after, type NextRequest } from "next/server";
import { getRoomBackend } from "@/lib/caption/roomBackend";
import { ADMIN_HALL, isAuthEnabled, sessionFromHeaders } from "@/lib/caption/hostedAuth";
import { safeHallId, usageChanges, usageDay, type UsageEvent } from "@/lib/caption/usage";

/** Header the console sends with its hall, so admin logins and laptops are counted per hall too. */
export const SESSION_HEADER = "x-livecap-session";

/** The hall a request belongs to: a hall login's own hall, otherwise the hall the console says. */
export async function hallForRequest(req: NextRequest): Promise<string> {
  if (isAuthEnabled()) {
    const auth = await sessionFromHeaders(req.headers);
    if (auth && auth.hall !== ADMIN_HALL) return auth.hall;
  }
  return safeHallId(req.headers.get(SESSION_HEADER)) || "default";
}

/** Counts one request for the monitoring page, after the response has gone out. Never throws. */
export function recordUsage(req: NextRequest, event: UsageEvent) {
  const now = Date.now();
  const work = async () => {
    try {
      const hall = await hallForRequest(req);
      const { incr, latest } = usageChanges(event, now);
      await getRoomBackend().recordUsage(hall, usageDay(now), incr, latest);
    } catch (err) {
      console.warn("[usage] not recorded:", err instanceof Error ? err.message : err);
    }
  };
  try {
    after(work);
  } catch {
    // Outside a request scope (tests): run now
    void work();
  }
}
