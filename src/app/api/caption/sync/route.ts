import { NextRequest, NextResponse } from "next/server";

// In-memory broadcast state map per session for cross-network sync
// Allows multiple operator laptops and multiple vMix PCs (Hall A, Hall B, Room 1, etc.) on the same LAN!
interface SyncState {
  currentCaption: any | null;
  config: any | null;
  pinnedAnnouncement: string | null;
  lastUpdated: number;
  sessionName?: string;
  createdAt: number;
}

const sessionStates = new Map<string, SyncState>();

function getSessionState(sessionId: string): SyncState {
  const id = sessionId?.trim() || "default";
  if (!sessionStates.has(id)) {
    sessionStates.set(id, {
      currentCaption: null,
      config: null,
      pinnedAnnouncement: null,
      lastUpdated: Date.now(),
      sessionName: id === "default" ? "Main Session" : id,
      createdAt: Date.now(),
    });
  }
  return sessionStates.get(id)!;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // Endpoint to list all active sessions
  if (action === "list-sessions") {
    // Ensure default exists
    getSessionState("default");
    const list = Array.from(sessionStates.entries()).map(([id, state]) => ({
      id,
      name: state.sessionName || id,
      lastUpdated: state.lastUpdated,
      createdAt: state.createdAt,
      hasCaption: !!state.currentCaption,
    }));
    return NextResponse.json({ sessions: list });
  }

  const sessionId = searchParams.get("session") || "default";
  const state = getSessionState(sessionId);

  return NextResponse.json(state, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const sessionId = (data.session || "default").trim();
    const state = getSessionState(sessionId);

    if (data.sessionName) {
      state.sessionName = data.sessionName;
    }

    if (data.type === "CAPTION_UPDATE") {
      state.currentCaption = data.caption;
      state.lastUpdated = Date.now();
    } else if (data.type === "CONFIG_UPDATE") {
      state.config = data.config;
      state.lastUpdated = Date.now();
    } else if (data.type === "CLEAR_SCREEN") {
      state.currentCaption = null;
      state.pinnedAnnouncement = null;
      state.lastUpdated = Date.now();
    } else if (data.type === "PIN_ANNOUNCEMENT") {
      state.pinnedAnnouncement = data.text;
      state.lastUpdated = Date.now();
    }

    return NextResponse.json({
      success: true,
      session: sessionId,
      lastUpdated: state.lastUpdated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Sync failed" }, { status: 500 });
  }
}
