import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MultiRoomHub } from "../roomStore.ts";
import {
  applyGlossary,
  formatSrtTimestamp,
  formatTranscriptJson,
  formatTranscriptSrt,
  formatTranscriptTxt,
  formatTranscriptVtt,
} from "../transcriptUtils.ts";
import {
  DEFAULT_CAPTION_CONFIG,
  DEFAULT_SPEAKERS,
  type CaptionItem,
  type ConnectedDevice,
} from "../types.ts";

describe("LiveCap Multi-Room, Multi-Device & Multi-Speaker Hub", () => {
  let hub: MultiRoomHub;

  beforeEach(() => {
    hub = new MultiRoomHub();
  });

  it("isolates captions, configurations, and announcements across multiple rooms", () => {
    const capHallA: CaptionItem = {
      id: "cap_a1",
      timestamp: 1000,
      sourceLang: "ko",
      sourceText: "안녕하세요",
      translatedText: "Xin chào hội trường A",
      isFinal: true,
      speakerId: "spk-1",
      speakerName: "Mr. Kim",
      speakerRole: "Keynote",
      speakerColor: "#F59E0B",
    };

    const capHallB: CaptionItem = {
      id: "cap_b1",
      timestamp: 1050,
      sourceLang: "en",
      sourceText: "Welcome to Breakout Room B",
      translatedText: "Chào mừng đến phòng hội thảo B",
      isFinal: true,
      speakerId: "spk-2",
      speakerName: "Ms. Sarah",
      speakerRole: "Panelist",
      speakerColor: "#10B981",
    };

    hub.applyEvent({
      type: "CAPTION_UPDATE",
      session: "hall-a",
      sessionName: "Hall A Main Stage",
      caption: capHallA,
    });

    hub.applyEvent({
      type: "CAPTION_UPDATE",
      session: "hall-b",
      sessionName: "Hall B Breakout",
      caption: capHallB,
    });

    hub.applyEvent({
      type: "PIN_ANNOUNCEMENT",
      session: "hall-a",
      text: "Phiên Q&A bắt đầu sau 5 phút",
    });

    const roomA = hub.getRoom("hall-a");
    const roomB = hub.getRoom("hall-b");

    assert.equal(roomA.currentCaption?.translatedText, "Xin chào hội trường A");
    assert.equal(roomB.currentCaption?.translatedText, "Chào mừng đến phòng hội thảo B");
    assert.equal(roomA.pinnedAnnouncement, "Phiên Q&A bắt đầu sau 5 phút");
    assert.equal(roomB.pinnedAnnouncement, null);

    // Clearing Hall A must not clear Hall B
    hub.applyEvent({ type: "CLEAR_SCREEN", session: "hall-a" });
    assert.equal(hub.getRoom("hall-a").currentCaption, null);
    assert.equal(hub.getRoom("hall-b").currentCaption?.id, "cap_b1");
  });

  it("merges concurrent multi-device & multi-speaker captions in chronological order", () => {
    const devMic1: ConnectedDevice = {
      deviceId: "dev_mic_1",
      deviceName: "Podium Laptop",
      role: "mic-node",
      speakerName: "Mr. Park (CEO)",
      lastSeen: Date.now(),
    };

    const devMic2: ConnectedDevice = {
      deviceId: "dev_mic_2",
      deviceName: "Wireless Panel Mic",
      role: "mic-node",
      speakerName: "Dr. Minh (Moderator)",
      lastSeen: Date.now(),
    };

    const devLed: ConnectedDevice = {
      deviceId: "dev_led_wall",
      deviceName: "Stage LED Wall 4K",
      role: "led",
      lastSeen: Date.now(),
    };

    hub.registerDevice("hall-a", devLed);

    // Device 2 arrives slightly out of order with an earlier timestamp
    hub.applyEvent({
      type: "CAPTION_UPDATE",
      session: "hall-a",
      device: devMic1,
      caption: {
        id: "c_second",
        timestamp: 2000,
        sourceLang: "ko",
        sourceText: "감사합니다",
        translatedText: "Xin cảm ơn",
        isFinal: true,
        speakerName: "Mr. Park (CEO)",
        speakerColor: "#F59E0B",
      },
    });

    hub.applyEvent({
      type: "CAPTION_UPDATE",
      session: "hall-a",
      device: devMic2,
      caption: {
        id: "c_first",
        timestamp: 1500,
        sourceLang: "en",
        sourceText: "Let us welcome Mr. Park",
        translatedText: "Xin mời ông Park phát biểu",
        isFinal: true,
        speakerName: "Dr. Minh (Moderator)",
        speakerColor: "#38BDF8",
      },
    });

    const room = hub.getRoom("hall-a");
    assert.equal(room.history.length, 2);
    // Chronologically sorted: c_first (1500) then c_second (2000)
    assert.equal(room.history[0].id, "c_first");
    assert.equal(room.history[0].speakerName, "Dr. Minh (Moderator)");
    assert.equal(room.history[1].id, "c_second");
    assert.equal(room.history[1].speakerName, "Mr. Park (CEO)");

    // All 3 devices (2 mic nodes + 1 LED wall) are tracked in the room
    assert.equal(Object.keys(room.devices).length, 3);

    const sessions = hub.listSessions();
    const hallASummary = sessions.find((s) => s.id === "hall-a");
    assert.ok(hallASummary);
    assert.equal(hallASummary.deviceCount, 3);
    assert.equal(hallASummary.captionCount, 2);
  });

  it("prunes disconnected devices after TTL expires", () => {
    const room = hub.getRoom("hall-a");
    const staleTime = Date.now() - 120_000; // 2 minutes ago
    room.devices["stale_dev"] = {
      deviceId: "stale_dev",
      deviceName: "Old Viewer",
      role: "viewer",
      lastSeen: staleTime,
    };
    room.devices["active_dev"] = {
      deviceId: "active_dev",
      deviceName: "Active LED",
      role: "led",
      lastSeen: Date.now(),
    };

    hub.pruneStaleDevices(room, Date.now());
    assert.equal(room.devices["stale_dev"], undefined);
    assert.ok(room.devices["active_dev"]);
  });
});

describe("Glossary & Transcript Export Utilities", () => {
  it("applies custom glossary terms with strict Unicode word boundaries", () => {
    const glossary = [
      { from: "AI", to: "Trí tuệ nhân tạo" },
      { from: "VBE", to: "VBE Event Group" },
      { from: "HCMC", to: "TP. Hồ Chí Minh" },
    ];

    const input = "Hội nghị AI của VBE tại HCMC ngày mai rất thành công.";
    const output = applyGlossary(input, glossary);

    // "AI" is replaced, but "mai" is NOT corrupted
    assert.equal(
      output,
      "Hội nghị Trí tuệ nhân tạo của VBE Event Group tại TP. Hồ Chí Minh ngày mai rất thành công."
    );
  });

  it("formats SRT, VTT, TXT, and JSON transcripts with speaker attribution", () => {
    const sampleHistory: CaptionItem[] = [
      {
        id: "1",
        timestamp: Date.UTC(2026, 9, 25, 8, 30, 0, 500),
        sourceLang: "ko",
        sourceText: "환영합니다",
        translatedText: "Chào mừng quý vị",
        isFinal: true,
        speakerName: "Mr. Kim",
        speakerRole: "Keynote",
      },
      {
        id: "2",
        timestamp: Date.UTC(2026, 9, 25, 8, 30, 4, 0),
        sourceLang: "en",
        sourceText: "Thank you Mr. Kim",
        translatedText: "Cảm ơn ông Kim",
        isFinal: true,
        speakerName: "MC Thảo",
        speakerRole: "Moderator",
      },
    ];

    assert.equal(
      formatSrtTimestamp(Date.UTC(2026, 9, 25, 8, 30, 0, 500)),
      "08:30:00,500"
    );

    const srt = formatTranscriptSrt(sampleHistory);
    assert.ok(srt.includes("[Mr. Kim] Chào mừng quý vị"));
    assert.ok(srt.includes("[MC Thảo] Cảm ơn ông Kim"));

    const vtt = formatTranscriptVtt(sampleHistory);
    assert.ok(vtt.startsWith("WEBVTT"));
    assert.ok(vtt.includes("<v Mr. Kim>Chào mừng quý vị"));

    const txt = formatTranscriptTxt(sampleHistory, "Hall A", "hall-a");
    assert.ok(txt.includes("[Mr. Kim - Keynote] [KO] 환영합니다"));

    const jsonRaw = formatTranscriptJson(sampleHistory, "Hall A", "hall-a");
    const parsed = JSON.parse(jsonRaw);
    assert.equal(parsed.totalCaptions, 2);
    assert.equal(parsed.captions[0].speakerName, "Mr. Kim");
  });

  it("provides production defaults for multi-speaker & LED stage configuration", () => {
    assert.ok(DEFAULT_SPEAKERS.length >= 4);
    assert.equal(DEFAULT_CAPTION_CONFIG.fontFamily, "'Roboto', sans-serif");
    assert.equal(DEFAULT_CAPTION_CONFIG.showSpeakerBadge, true);
  });
});
