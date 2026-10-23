import { NextRequest, NextResponse } from "next/server";

// Global in-memory broadcast state for cross-network sync
// Allows an operator laptop to broadcast live subtitles to vMix running on a separate PC on the same Wi-Fi/LAN!
interface SyncState {
  currentCaption: any | null;
  config: any | null;
  pinnedAnnouncement: string | null;
  lastUpdated: number;
}

let globalSyncState: SyncState = {
  currentCaption: null,
  config: null,
  pinnedAnnouncement: null,
  lastUpdated: Date.now(),
};

export async function GET() {
  return NextResponse.json(globalSyncState, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    if (data.type === "CAPTION_UPDATE") {
      globalSyncState.currentCaption = data.caption;
      globalSyncState.lastUpdated = Date.now();
    } else if (data.type === "CONFIG_UPDATE") {
      globalSyncState.config = data.config;
      globalSyncState.lastUpdated = Date.now();
    } else if (data.type === "CLEAR_SCREEN") {
      globalSyncState.currentCaption = null;
      globalSyncState.pinnedAnnouncement = null;
      globalSyncState.lastUpdated = Date.now();
    } else if (data.type === "PIN_ANNOUNCEMENT") {
      globalSyncState.pinnedAnnouncement = data.text;
      globalSyncState.lastUpdated = Date.now();
    }

    return NextResponse.json({ success: true, lastUpdated: globalSyncState.lastUpdated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Sync failed" }, { status: 500 });
  }
}
