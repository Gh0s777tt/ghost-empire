// src/app/privacy/page.tsx
// Polityka prywatności — wymóg RODO przy zbieraniu danych osobowych przez OAuth
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/Header";
import { getCurrentTenant, isFounderBrand } from "@/lib/tenant";
import { Shield } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/privacy", locale) };
}

const S2B = ["s2b1", "s2b2", "s2b3", "s2b4", "s2b5", "s2b6"];
const S2C = ["s2c1", "s2c2", "s2c3", "s2c4", "s2c5", "s2c6", "s2c7"];
const S3 = ["s3b1", "s3b2", "s3b3", "s3b4", "s3b5"];
const S4 = ["s4b1", "s4b2", "s4b3", "s4b5", "s4b6", "s4b7", "s4b4"];
const S5 = ["s5b1", "s5b2", "s5b3", "s5b4", "s5b5", "s5b6"];
const S6 = ["s6b1", "s6b2", "s6b3", "s6b4", "s6b5", "s6b6"];
const S7 = ["s7b1", "s7b2", "s7b3", "s7b4", "s7b5", "s7b6", "s7b7", "s7b8"];

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  // White-label: contact goes to THIS portal's Discord (socialLinks); founder invite only on the
  // founder brand. The i18n child bakes the founder URL, so we ignore it and render a derived label.
  const tenant = await getCurrentTenant();
  const discordUrl =
    tenant.socialLinks?.find((s) => s.platform === "discord")?.url ??
    (isFounderBrand(tenant) ? "https://discord.gg/deAPJ9Ym2F" : null);
  const richTags = {
    b: (c: ReactNode) => <strong className="text-white">{c}</strong>,
    em: (c: ReactNode) => <em>{c}</em>,
    discord: () =>
      discordUrl ? (
        <a href={discordUrl} target="_blank" rel="noreferrer" className="text-red-400 hover:underline">
          {discordUrl.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        <Link href="/support" className="text-red-400 hover:underline">{tenant.name}</Link>
      ),
  };
  // Dynamic-key helper (messages aren't statically typed here).
  const tr = (key: string): ReactNode =>
    (t.rich as unknown as (k: string, v: typeof richTags) => ReactNode)(key, richTags);

  return (
    <div className="min-h-screen bg-black">
      <Header />
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-6 h-6 text-red-500" />
              <h1
                className="font-display text-4xl text-white tracking-wider"
                style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
              >
                {t("title")}
              </h1>
            </div>
            <p className="text-zinc-500 text-sm">{t("lastUpdated")}</p>
          </div>

          <Section title={t("s1")}>
            <p>{tr("s1p")}</p>
          </Section>

          <Section title={t("s2")}>
            <p className="mb-3">{t("s2intro1")}</p>
            <ul className="space-y-1.5 ms-4">
              {S2B.map((k) => <Bullet key={k}>{tr(k)}</Bullet>)}
            </ul>
            <p className="mt-3">{t("s2intro2")}</p>
            <ul className="space-y-1.5 ms-4 mt-2">
              {S2C.map((k) => <Bullet key={k}>{tr(k)}</Bullet>)}
            </ul>
          </Section>

          <Section title={t("s3")}>
            <ul className="space-y-1.5 ms-4">
              {S3.map((k) => <Bullet key={k}>{tr(k)}</Bullet>)}
            </ul>
          </Section>

          <Section title={t("s4")}>
            <ul className="space-y-1.5 ms-4">
              {S4.map((k) => <Bullet key={k}>{tr(k)}</Bullet>)}
            </ul>
          </Section>

          <Section title={t("sGoogle")}>
            <p>{tr("sGooglep")}</p>
          </Section>

          <Section title={t("s5")}>
            <ul className="space-y-1.5 ms-4">
              {S5.map((k) => <Bullet key={k}>{tr(k)}</Bullet>)}
            </ul>
          </Section>

          <Section title={t("s6")}>
            <ul className="space-y-1.5 ms-4">
              {S6.map((k) => <Bullet key={k}>{tr(k)}</Bullet>)}
            </ul>
            <p className="mt-3">{tr("s6p")}</p>
          </Section>

          <Section title={t("s7")}>
            <p>{t("s7intro")}</p>
            <ul className="space-y-1.5 ms-4 mt-2">
              {S7.map((k) => <Bullet key={k}>{tr(k)}</Bullet>)}
            </ul>
          </Section>

          <Section title={t("s8")}>
            <p>{t("s8p")}</p>
          </Section>

          <Section title={t("s9")}>
            <p>{t("s9p")}</p>
          </Section>

          <div className="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
            {t("seeAlso")} <Link href="/terms" className="text-zinc-400 hover:text-red-400">{t("termsLink")}</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-5"
      style={{
        clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
      }}
    >
      <h2 className="font-display text-xl text-white tracking-wider mb-3">{title}</h2>
      <div className="text-zinc-300 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-red-500 shrink-0">▸</span>
      <span>{children}</span>
    </li>
  );
}
