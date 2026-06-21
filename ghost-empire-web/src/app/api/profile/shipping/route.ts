// src/app/api/profile/shipping/route.ts
// The owner's shipping/contact PII for physical-reward fulfillment (#audit3). Every
// sensitive field is encrypted at rest (lib/crypto AES-256-GCM). GET decrypts for the
// owner only; PUT requires EXPLICIT consent and re-encrypts; DELETE is GDPR erasure.
// Never exposes anyone else's data — strictly scoped to session.user.id.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { encryptSecretStrict, decryptSecret } from "@/lib/crypto";
import { cleanShippingInput, hasAnyShipping } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const row = await prisma.shippingProfile.findUnique({ where: { userId: session.user.id } });
  if (!row) return NextResponse.json({ hasProfile: false });
  return NextResponse.json({
    hasProfile: true,
    fullName: decryptSecret(row.fullName),
    phone: decryptSecret(row.phone),
    email: decryptSecret(row.email),
    addressLine: decryptSecret(row.addressLine),
    city: decryptSecret(row.city),
    postalCode: decryptSecret(row.postalCode),
    parcelLocker: decryptSecret(row.parcelLocker),
    country: row.country ?? null,
    consentAt: row.consentAt?.toISOString() ?? null,
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;
  const rl = await rateLimit(`shipping:${userId}`, 20, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return jsonError("Nieprawidłowe dane", 400); }
  // Explicit consent is required to store shipping PII (GDPR Art. 6/7).
  if (body.consent !== true) return jsonError("Wymagana zgoda na przechowywanie danych", 400);

  const input = cleanShippingInput(body);
  if (!hasAnyShipping(input)) return jsonError("Brak danych do zapisania", 400);

  const tid = await currentTenantId();
  // Fail-CLOSED for PII: a crypto error throws (→ 500) instead of storing the address in
  // cleartext. Wrapped below so the user sees a clean error, never a silent plaintext write.
  const enc = (v?: string) => (v ? encryptSecretStrict(v) : null);
  const fields = {
    fullName: enc(input.fullName),
    phone: enc(input.phone),
    email: enc(input.email),
    addressLine: enc(input.addressLine),
    city: enc(input.city),
    postalCode: enc(input.postalCode),
    parcelLocker: enc(input.parcelLocker),
    country: input.country ?? null,
    consentAt: new Date(),
  };
  await prisma.shippingProfile.upsert({
    where: { userId },
    create: { userId, ...(tid ? { tenantId: tid } : {}), ...fields },
    update: { ...(tid ? { tenantId: tid } : {}), ...fields },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  await prisma.shippingProfile.deleteMany({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
