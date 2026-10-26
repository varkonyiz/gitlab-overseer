/** OAuth 2.0 PKCE helpers (RFC 7636): random verifier/state and the S256 challenge. */

const VERIFIER_BYTES = 48; // 64 base64url characters (43–128 allowed)
const STATE_BYTES = 24;

export function randomToken(byteLength: number, crypto: Crypto = globalThis.crypto): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export function createCodeVerifier(crypto: Crypto = globalThis.crypto): string {
  return randomToken(VERIFIER_BYTES, crypto);
}

export function createState(crypto: Crypto = globalThis.crypto): string {
  return randomToken(STATE_BYTES, crypto);
}

export async function codeChallengeS256(
  verifier: string,
  crypto: Crypto = globalThis.crypto,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time comparison for the OAuth state (avoids leaking how many characters matched). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
