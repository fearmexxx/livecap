import type { CaptionConfig } from "./types";

/** Config fields that hold credentials and must never leave the operator machine. */
export const SECRET_CONFIG_KEYS = [
  "openrouterApiKey",
  "openaiApiKey",
  "deeplApiKey",
  "googleCloudApiKey",
] as const satisfies ReadonlyArray<keyof CaptionConfig>;

export const PIN_HEADER = "x-livecap-pin";

/** Returns a copy of the config with every API key removed. */
export function stripSecrets<T extends Partial<CaptionConfig> | null | undefined>(config: T): T {
  if (!config || typeof config !== "object") return config;
  const clean = { ...config } as Record<string, unknown>;
  for (const key of SECRET_CONFIG_KEYS) {
    delete clean[key];
  }
  return clean as T;
}

/** The room PIN configured on this server via LIVECAP_PIN, or null when writes are open. */
export function getConfiguredPin(): string | null {
  const pin = process.env.LIVECAP_PIN?.trim();
  return pin ? pin : null;
}

/**
 * True when the request may change captions or spend API credit.
 * With no LIVECAP_PIN set, every request is allowed (single-PC / localhost mode).
 */
export function hasWriteAccess(headers: Headers, configuredPin = getConfiguredPin()): boolean {
  if (!configuredPin) return true;
  const supplied = headers.get(PIN_HEADER)?.trim() || "";
  return constantTimeEqual(supplied, configuredPin);
}

// Plain-JS constant-time compare so this module also loads in the browser bundle.
function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const PIN_REQUIRED_MESSAGE =
  "Room PIN required. Enter the PIN from LIVECAP_PIN in Settings → API & AI → Room PIN.";
