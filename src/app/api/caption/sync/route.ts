import { NextRequest, NextResponse } from "next/server";
import { multiRoomHub } from "@/lib/caption/roomStore";
import { ConnectedDevice } from "@/lib/caption/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // Endpoint to list all active rooms/sessions with live telemetry
  if (action === "list-sessions") {
    const sessions = multiRoomHub.listSessions();
    return NextResponse.json(
      { sessions },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  const sessionId = searchParams.get("session") || "default";
  const deviceId = searchParams.get("deviceId");
  const deviceRole = (searchParams.get("role") || "viewer") as ConnectedDevice["role"];
  const deviceName = searchParams.get("deviceName") || undefined;
  const speakerName = searchParams.get("speakerName") || undefined;

  if (deviceId) {
    multiRoomHub.registerDevice(sessionId, {
      deviceId,
      deviceName: deviceName || `${deviceRole.toUpperCase()} (${deviceId.slice(-4)})`,
      role: deviceRole,
      speakerName,
      lastSeen: Date.now(),
    });
  }

  const room = multiRoomHub.getRoom(sessionId);
  multiRoomHub.pruneStaleDevices(room);

  return NextResponse.json(
    {
      id: room.id,
      sessionName: room.sessionName,
      currentCaption: room.currentCaption,
      history: room.history,
      config: room.config,
      pinnedAnnouncement: room.pinnedAnnouncement,
      devices: Object.values(room.devices),
      deviceCount: Object.keys(room.devices).length,
      lastUpdated: room.lastUpdated,
      createdAt: room.createdAt,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const sessionId = (data.session || "default").trim() || "default";

    if (data.type === "CLEAR_HISTORY") {
      const room = multiRoomHub.clearRoomHistory(sessionId);
      return NextResponse.json({
        success: true,
        session: sessionId,
        lastUpdated: room.lastUpdated,
      });
    }

    const room = multiRoomHub.applyEvent(data);

    return NextResponse.json({
      success: true,
      session: sessionId,
      lastUpdated: room.lastUpdated,
      deviceCount: Object.keys(room.devices).length,
      captionCount: room.history.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Sync failed" }, { status: 500 });
  }
}
