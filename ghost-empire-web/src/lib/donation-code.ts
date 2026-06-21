// src/lib/donation-code.ts
// A short per-user code (#audit3) a viewer puts in their donation MESSAGE so a Streamlabs
// donation can be VERIFIABLY credited to them — replacing the spoofable donor-name auto-match
// (an attacker could otherwise aim a donation's GT at any same-named account). The code is
// shown on the user's profile; matchDonationToUser extracts it from the message. Pure helpers.

export const DONATION_CODE_LEN = 6;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous (no 0/O/1/I)
const PREFIX = "GE-"; // recognizable marker inside a free-text donation message

/** A random donation code like "GE-ABC234". `rand` is injectable for deterministic tests. */
export function generateDonationCode(rand: () => number = Math.random): string {
  let out = PREFIX;
  for (let i = 0; i < DONATION_CODE_LEN; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return out;
}

/** Find a donation code in a free-text message; returns the normalized code (with prefix) or null. */
export function extractDonationCode(message: string | null | undefined): string | null {
  if (!message) return null;
  const m = message.toUpperCase().match(new RegExp(`GE-([${ALPHABET}]{${DONATION_CODE_LEN}})`));
  return m ? PREFIX + m[1] : null;
}

/** Valid stored code = "GE-" + exactly LEN chars from the alphabet. */
export function isValidDonationCode(s: string): boolean {
  return new RegExp(`^GE-[${ALPHABET}]{${DONATION_CODE_LEN}}$`).test(s);
}
