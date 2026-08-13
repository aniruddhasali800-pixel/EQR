/**
 * Rotating QR token helpers. The token changes every second: it is an HMAC of
 * `sessionId|tick` where tick is the current unix second. Both browser and
 * server runtimes provide Web Crypto, so this module is isomorphic.
 */

const encoder = new TextEncoder();

async function importKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function currentTick() {
  return Math.floor(Date.now() / 1000);
}

export async function signTick(secret: string, sessionId: string, tick: number) {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${sessionId}|${tick}`));
  return toHex(signature).slice(0, 16);
}

export async function buildToken(secret: string, sessionId: string, tick = currentTick()) {
  const signature = await signTick(secret, sessionId, tick);
  return `CERP1|${sessionId}|${tick}|${signature}`;
}

export function parseToken(raw: string) {
  const parts = raw.trim().split("|");
  if (parts.length !== 4 || parts[0] !== "CERP1") return null;
  const tick = Number(parts[2]);
  if (!Number.isFinite(tick)) return null;
  return { sessionId: parts[1]!, tick, signature: parts[3]! };
}

/** Tokens stay valid for a short window so slow scans still work. */
export const TOKEN_TOLERANCE_SECONDS = 20;

export async function verifyToken(secret: string, raw: string) {
  const parsed = parseToken(raw);
  if (!parsed)
    return { ok: false as const, reason: "This is not a Campus ERP attendance QR code." };
  const drift = Math.abs(currentTick() - parsed.tick);
  if (drift > TOKEN_TOLERANCE_SECONDS) {
    return { ok: false as const, reason: "This QR code has expired. Scan the live code again." };
  }
  const expected = await signTick(secret, parsed.sessionId, parsed.tick);
  if (expected !== parsed.signature) {
    return { ok: false as const, reason: "Invalid QR code signature." };
  }
  return { ok: true as const, sessionId: parsed.sessionId };
}

export function buildStudentToken(userId: string) {
  return `CERP_STUDENT|${userId}`;
}

export function parseStudentToken(raw: string) {
  const parts = raw.trim().split("|");
  if (parts.length === 2 && parts[0] === "CERP_STUDENT" && parts[1]) {
    return { userId: parts[1] };
  }
  return null;
}
