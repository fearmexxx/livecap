import { NextRequest, NextResponse } from "next/server";
import { getRoomBackend, normalizeSessionId } from "@/lib/caption/roomBackend";
import { ConnectedDevice } from "@/lib/caption/types";
import { hasWriteAccess, PIN_REQUIRED_MESSAGE, stripSecrets } from "@/lib/caption/security";
import { canUseHall, isAuthEnabled, sessionFromHeaders } from "@/lib/caption/hostedAuth";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

// Read access (GET) is checked in src/proxy.ts: a login for this hall, or the hall's view key.
export async function GET(req: NextRequest) {
  const backend = getRoomBackend();
  const { searchParams } = new URL(req.url);

  if (searchParams.get("action") === "list-sessions") {
    let sessions = await backend.listSessions();
    if (isAuthEnabled()) {
      const auth = await sessionFromHeaders(req.headers);
      sessions = sessions.filter((s) => canUseHall(auth, s.id));
    }
    return NextResponse.json({ sessions }, { headers: NO_STORE });
  }

  const sessionId = normalizeSessionId(searchParams.get("session"));
  const deviceId = searchParams.get("deviceId");
  const deviceRole = (searchParams.get("role") || "viewer") as ConnectedDevice["role"];
  const deviceName = searchParams.get("deviceName") || undefined;
  const speakerName = searchParams.get("speakerName") || undefined;
  const since = Number(searchParams.get("since")) || 0;

  // Pollers only send their device every few seconds; only then is the device list refreshed
  let devices: ConnectedDevice[] | undefined;
  if (deviceId) {
    await backend.registerDevice(sessionId, {
      deviceId,
      deviceName: deviceName || `${deviceRole.toUpperCase()} (${deviceId.slice(-4)})`,
      role: deviceRole,
      speakerName,
      lastSeen: Date.now(),
    });
    devices = await backend.getDevices(sessionId);
  }

  // Nothing changed since the poller's last update: answer without the room body
  if (since > 0) {
    const lastUpdated = await backend.getLastUpdated(sessionId);
    if (lastUpdated && lastUpdated <= since) {
      return NextResponse.json(
        { id: sessionId, unchanged: true, lastUpdated, devices, deviceCount: devices?.length },
        { headers: NO_STORE }
      );
    }
  }

  const room = await backend.getRoom(sessionId);
  return NextResponse.json(
    {
      id: room.id,
      sessionName: room.sessionName,
      currentCaption: room.currentCaption,
      history: room.history,
      config: stripSecrets(room.config),
      pinnedAnnouncement: room.pinnedAnnouncement,
      devices,
      deviceCount: devices?.length,
      lastUpdated: room.lastUpdated,
      createdAt: room.createdAt,
    },
    { headers: NO_STORE }
  );
}

export async function POST(req: NextRequest) {
  if (!hasWriteAccess(req.headers)) {
    return NextResponse.json({ error: PIN_REQUIRED_MESSAGE, pinRequired: true }, { status: 401 });
  }
  try {
    const backend = getRoomBackend();
    const data = await req.json();
    const sessionId = normalizeSessionId(data.session);
    data.session = sessionId;

    // Hosted: a hall login may only write to its own hall
    if (isAuthEnabled() && !canUseHall(await sessionFromHeaders(req.headers), sessionId)) {
      return NextResponse.json({ error: "This login cannot send captions to " + sessionId }, { status: 403 });
    }

    if (data.type === "CONFIG_UPDATE") {
      data.config = stripSecrets(data.config);
    }

    if (data.type === "CLEAR_HISTORY") {
      const room = await backend.clearRoomHistory(sessionId);
      return NextResponse.json({ success: true, session: sessionId, lastUpdated: room.lastUpdated });
    }

    if (data.type === "HEARTBEAT") {
      if (data.device) await backend.registerDevice(sessionId, data.device);
      return NextResponse.json({ success: true, session: sessionId });
    }

    const room = await backend.applyEvent(data);
    return NextResponse.json({
      success: true,
      session: sessionId,
      lastUpdated: room.lastUpdated,
      captionCount: room.history.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Sync failed" }, { status: 500 });
  }
}
