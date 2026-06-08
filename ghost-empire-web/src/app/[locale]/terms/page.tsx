// src/app/terms/page.tsx
// Regulamin portalu Ghost Empire
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/Header";
import { FileText } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "terms" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/terms", locale) };
}

const SECTIONS_A = [
  { title: "s1", items: ["s1i1", "s1i2", "s1i3"] },
  { title: "s2", items: ["s2i1", "s2i2", "s2i3", "s2i4", "s2i5"] },
  { title: "s3", items: ["s3i1", "s3i2", "s3i3", "s3i4", "s3i5", "s3i6"] },
  { title: "s4", items: ["s4i1", "s4i2", "s4i3", "s4i4", "s4i5"] },
  { title: "s5", items: ["s5i1", "s5i2", "s5i3", "s5i4", "s5i5"] },
];
const SECTIONS_B = [
  { title: "s7", items: ["s7i1", "s7i2", "s7i3", "s7i4"] },
  { title: "s8", items: ["s8i1", "s8i2", "s8i3", "s8i4"] },
  { title: "s9", items: ["s9i1", "s9i2", "s9i3"] },
  { title: "s10", items: ["s10i1", "s10i2", "s10i3", "s10i4"] },
];
const BULLETS6 = ["s6b1", "s6b2", "s6b3", "s6b4", "s6b5", "s6b6", "s6b7"];

export default async function TermsPage() {
  const t = await getTranslations("terms");
  const richTags = {
    b: (c: ReactNode) => <strong className="text-white">{c}</strong>,
    em: (c: ReactNode) => <em>{c}</em>,
    privacy: (c: ReactNode) => <Link href="/privacy" className="text-red-400 hover:underline">{c}</Link>,
    discord: (c: ReactNode) => (
      <a href="https://discord.gg/deAPJ9Ym2F" target="_blank" rel="noreferrer" className="text-red-400 hover:underline">{c}</a>
    ),
  };
  // Dynamic-key helpers (messages aren't statically typed here).
  const ts = (key: string): string => (t as unknown as (k: string) => string)(key);
  const tr = (key: string): ReactNode =>
    (t.rich as unknown as (k: string, v: typeof richTags) => ReactNode)(key, richTags);

  return (
    <div className="min-h-screen bg-black">
      <Header />
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-6 h-6 text-red-500" />
              <h1
                className="font-display text-4xl text-white tracking-wider"
                style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
              >
                {t("title")}
              </h1>
            </div>
            <p className="text-zinc-500 text-sm">{t("lastUpdated")}</p>
          </div>

          {SECTIONS_A.map((sec) => (
            <Section key={sec.title} title={ts(sec.title)}>
              <Numbered>
                {sec.items.map((k) => <Item key={k}>{tr(k)}</Item>)}
              </Numbered>
            </Section>
          ))}

          <Section title={t("s6")}>
            <p className="mb-3">{t("s6intro")}</p>
            <ul className="space-y-1.5 ms-4">
              {BULLETS6.map((k) => <Bullet key={k}>{tr(k)}</Bullet>)}
            </ul>
          </Section>

          {SECTIONS_B.map((sec) => (
            <Section key={sec.title} title={ts(sec.title)}>
              <Numbered>
                {sec.items.map((k) => <Item key={k}>{tr(k)}</Item>)}
              </Numbered>
            </Section>
          ))}

          <div className="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
            {t("seeAlso")} <Link href="/privacy" className="text-zinc-400 hover:text-red-400">{t("privacyLink")}</Link>
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

function Numbered({ children }: { children: ReactNode }) {
  return <ol className="space-y-1.5 ms-4 list-decimal list-outside marker:text-red-500 marker:font-mono">{children}</ol>;
}

function Item({ children }: { children: ReactNode }) {
  return <li className="ps-1">{children}</li>;
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-red-500 shrink-0">▸</span>
      <span>{children}</span>
    </li>
  );
}
