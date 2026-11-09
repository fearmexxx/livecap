/**
 * Hall logins for the hosted (Vercel) version.
 *
 * Turned on by setting LIVECAP_HALL_PASSWORDS ("hall-1:pass1,hall-2:pass2,...") and/or
 * LIVECAP_ADMIN_PASSWORD. With neither set, LiveCap runs open as before (laptop / localhost mode).
 *
 * - A hall login can run only that hall's console. The admin login can run every hall.
 * - Output pages (LED, vMix/OBS overlay, window) also open with a per-hall "view key" in the URL
 *   (`&k=...`), because vMix and OBS browser inputs cannot log in. The key only allows reading.
 * - Sessions are an HMAC-signed cookie, so no database is needed for logins.
 *
 * Uses Web Crypto only, so it runs in the proxy, in route handlers and in tests.
 */

export const AUTH_COOKIE = "livecap_auth";
export const ADMIN_HALL = "*";
export const SESSION_DAYS = 14;
const MIN_PASSWORD_LENGTH = 6; // Shorter ones are ignored: that hall simply cannot log in

export interface AuthEnv {
  LIVECAP_HALL_PASSWORDS?: string;
  LIVECAP_ADMIN_PASSWORD?: string;
  LIVECAP_AUTH_SECRET?: string;
}

export interface AuthSession {
  /** Hall id such as "hall-2", or "*" for the admin login */
  hall: string;
  /** Expiry, ms since epoch */
  exp: number;
}

/** Parses "hall-1:pass1, hall-2:pass2" into { "hall-1": "pass1", ... }. */
export function parseHallPasswords(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (raw || "").split(/[,;\n]/)) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const hall = part.slice(0, idx).trim().toLowerCase();
    const pass = part.slice(idx + 1).trim();
    if (hall && pass.length >= MIN_PASSWORD_LENGTH && /^[a-z0-9_-]+$/.test(hall)) out[hall] = pass;
  }
  return out;
}

function adminPassword(env: AuthEnv): string | null {
  const admin = env.LIVECAP_ADMIN_PASSWORD?.trim();
  return admin && admin.length >= MIN_PASSWORD_LENGTH ? admin : null;
}

export function isAuthEnabled(env: AuthEnv = process.env as AuthEnv): boolean {
  return Object.keys(parseHallPasswords(env.LIVECAP_HALL_PASSWORDS)).length > 0 || !!adminPassword(env);
}

/** On Vercel the site is public, so running without logins would give anyone the API key's credit. */
export function isHostedWithoutLogins(env: AuthEnv & { VERCEL?: string } = process.env as AuthEnv): boolean {
  return !!env.VERCEL && !isAuthEnabled(env);
}

/** Halls offered on the login page, in order. */
export function listHalls(env: AuthEnv = process.env as AuthEnv): string[] {
  return Object.keys(parseHallPasswords(env.LIVECAP_HALL_PASSWORDS)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The signing secret. LIVECAP_AUTH_SECRET when set; otherwise derived from the passwords, so a
 * minimal setup needs only the passwords (changing a password then signs everyone out).
 */
export async function getAuthSecret(env: AuthEnv = process.env as AuthEnv): Promise<string> {
  const explicit = env.LIVECAP_AUTH_SECRET?.trim();
  if (explicit) return explicit;
  const material = `livecap|${env.LIVECAP_HALL_PASSWORDS || ""}|${env.LIVECAP_ADMIN_PASSWORD || ""}`;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(material));
  return toBase64Url(new Uint8Array(digest));
}

/** Checks a login attempt; returns the hall the session is for, or null. */
export function checkPassword(hall: string, password: string, env: AuthEnv = process.env as AuthEnv): string | null {
  const supplied = (password || "").trim();
  if (!supplied) return null;
  const admin = adminPassword(env);
  if (hall === ADMIN_HALL) return admin && safeEqual(supplied, admin) ? ADMIN_HALL : null;
  const expected = parseHallPasswords(env.LIVECAP_HALL_PASSWORDS)[hall];
  if (expected && safeEqual(supplied, expected)) return hall;
  // The admin password also opens any single hall
  if (admin && safeEqual(supplied, admin) && /^[a-z0-9_-]+$/.test(hall)) return hall;
  return null;
}

export async function signSession(session: AuthSession, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(session)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<AuthSession | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, await hmac(secret, body))) return null;
  try {
    const data = JSON.parse(fromBase64Url(body)) as AuthSession;
    if (typeof data.hall !== "string" || typeof data.exp !== "number" || data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}

/** Read-only key for a hall's output pages (vMix / OBS / LED), used as `&k=` in the URL. */
export async function viewKeyFor(hall: string, secret: string): Promise<string> {
  return (await hmac(secret, `view:${hall}`)).slice(0, 22);
}

export async function isValidViewKey(hall: string, key: string | null | undefined, secret: string): Promise<boolean> {
  if (!key) return false;
  return safeEqual(key, await viewKeyFor(hall, secret));
}

/** What a view key may read: display settings only, not the event's terms or briefing. */
export function viewerSafeConfig<T extends { customGlossary?: unknown; eventContext?: unknown }>(config: T | null): T | null {
  return config ? { ...config, customGlossary: [], eventContext: "" } : config;
}

export function canUseHall(session: AuthSession | null, hall: string): boolean {
  if (!session) return false;
  return session.hall === ADMIN_HALL || session.hall === hall;
}

/** Reads one cookie from a Cookie header. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  for (const part of (cookieHeader || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

/** Session from a request's cookies, or null. */
export async function sessionFromHeaders(headers: Headers, env: AuthEnv = process.env as AuthEnv): Promise<AuthSession | null> {
  return verifySession(readCookie(headers.get("cookie"), AUTH_COOKIE), await getAuthSecret(env));
}
