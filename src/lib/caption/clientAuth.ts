import { PIN_HEADER } from "./security";

/** Client-side helpers for the per-device room PIN (stored only in this browser, never synced). */
export const PIN_STORAGE_KEY = "vbe_livecap_room_pin";

export function getStoredPin(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(PIN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredPin(pin: string) {
  try {
    if (pin.trim()) localStorage.setItem(PIN_STORAGE_KEY, pin.trim());
    else localStorage.removeItem(PIN_STORAGE_KEY);
  } catch {
    // private mode
  }
}

/** Headers to attach to every write request (sync, translate, transcribe). */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const pin = getStoredPin();
  const headers: Record<string, string> = pin ? { ...extra, [PIN_HEADER]: pin } : { ...extra };
  // The hall this console runs, so the monitoring page can count usage per hall
  const session = currentSession();
  if (session) headers["x-livecap-session"] = session;
  return headers;
}

function currentSession(): string {
  if (typeof window === "undefined") return "";
  try {
    return (new URLSearchParams(window.location.search).get("session") || "").slice(0, 40);
  } catch {
    return "";
  }
}
