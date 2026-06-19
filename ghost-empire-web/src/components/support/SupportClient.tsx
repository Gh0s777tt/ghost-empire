"use client";
// src/components/support/SupportClient.tsx
// Public support/tip page UI (#514): payment links, crypto (one-tap copy + QR),
// bank/IBAN (masked → reveal-on-click + copy + SEPA QR), plus a shareable page-QR.
import { useState } from "react";
import { Heart, Copy, Check, Eye, QrCode, ExternalLink, Download, Star, Link2, Share2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { maskIban, formatIban } from "@/lib/payment-methods";

type Method = {
  id: string; kind: "link" | "crypto" | "bank"; label: string; value: string;
  network: string | null; note: string | null; icon: string | null; featured: boolean; qr: string | null;
};
type Goal = { title: string; target: number; current: number; currency: string };
type Supporter = { name: string | null; amount: number | null; amountLabel: string | null };
const KIND_EMOJI: Record<Method["kind"], string> = { link: "🔗", crypto: "🪙", bank: "🏦" };

const SHARE_TARGETS: { key: string; label: string; href: (u: string, text: string) => string }[] = [
  { key: "telegram", label: "Telegram", href: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: "x", label: "X", href: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: "whatsapp", label: "WhatsApp", href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { key: "reddit", label: "Reddit", href: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
];

export function SupportClient({
  owner, brandName, logoUrl, methods, pageQr, pageUrl, goal, supporters = [],
}: {
  owner: string; brandName: string; logoUrl: string | null;
  methods: Method[]; pageQr: string | null; pageUrl: string; goal: Goal | null;
  supporters?: Supporter[];
}) {
  const nf = useLocale();
  const t = useTranslations("support");
  const [copied, setCopied] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [qrOpen, setQrOpen] = useState<Set<string>>(new Set());
  const [pageQrOpen, setPageQrOpen] = useState(false);

  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1600); }
    catch { /* clipboard blocked — the value is still visible to copy manually */ }
  }
  const toggle = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
    const next = new Set(set); next.has(id) ? next.delete(id) : next.add(id); setFn(next);
  };

  return (
    <div>
      <header className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl border border-zinc-800 flex items-center justify-center overflow-hidden" style={{ background: "rgb(var(--brand-rgb) / 0.15)" }}>
          {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full object-cover" /> : <Heart className="w-7 h-7 text-red-500" />}
        </div>
        <h1 className="text-2xl font-bold text-white">{t("title", { name: owner })}</h1>
        <p className="text-zinc-500 text-sm mt-1">{t("subtitle", { brand: brandName })}</p>
      </header>

      {/* Fundraising goal */}
      {goal && (
        <div className="mb-6 border border-zinc-800 bg-black/30 rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-2 gap-2">
            <span className="text-sm text-white font-semibold truncate">{goal.title}</span>
            <span className="text-xs font-mono text-zinc-400 shrink-0">{goal.current.toLocaleString(nf)} / {goal.target.toLocaleString(nf)} {goal.currency}</span>
          </div>
          <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((goal.current / goal.target) * 100))}%`, background: "rgb(var(--brand-rgb))" }} />
          </div>
          <div className="text-right text-[10px] text-zinc-500 mt-1">{Math.min(100, Math.round((goal.current / goal.target) * 100))}%</div>
        </div>
      )}

      {methods.length === 0 ? (
        <div className="border border-zinc-900 bg-black/20 rounded-xl p-8 text-center">
          <Heart className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-400 text-sm">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {methods.map((m) => {
            const isRevealed = revealed.has(m.id);
            const showQr = qrOpen.has(m.id);
            return (
              <div key={m.id} className={`border rounded-xl p-3.5 ${m.featured ? "border-amber-600/60 bg-amber-950/10" : "border-zinc-800 bg-black/30"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl shrink-0">{m.icon || KIND_EMOJI[m.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white font-semibold flex items-center gap-1.5">
                      {m.label}
                      {m.network && <span className="text-[10px] font-mono text-zinc-500 uppercase">{m.network}</span>}
                      {m.featured && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-widest uppercase text-amber-400"><Star className="w-2.5 h-2.5 fill-amber-400" /> {t("featured")}</span>}
                    </div>
                    {m.note && <div className="text-[11px] text-zinc-500 truncate">{m.note}</div>}

                    {/* Value row — varies by kind */}
                    {m.kind === "link" ? (
                      <a href={m.value} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium">
                        <Link2 className="w-3.5 h-3.5" /> {t("open")} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <div className="mt-1.5 font-mono text-[11px] text-zinc-300 break-all">
                        {m.kind === "bank" && !isRevealed ? maskIban(m.value) : m.kind === "bank" ? formatIban(m.value) : m.value}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.kind === "bank" && !isRevealed && (
                      <button onClick={() => toggle(revealed, setRevealed, m.id)} title={t("reveal")} className="text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-lg w-8 h-8 flex items-center justify-center"><Eye className="w-3.5 h-3.5" /></button>
                    )}
                    {m.kind !== "link" && (
                      <button onClick={() => void copy(m.id, m.value)} title={t("copy")} className="text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-lg w-8 h-8 flex items-center justify-center">
                        {copied === m.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {m.qr && (
                      <button onClick={() => toggle(qrOpen, setQrOpen, m.id)} title={t("qr")} className={`border rounded-lg w-8 h-8 flex items-center justify-center ${showQr ? "border-red-600 text-white" : "border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"}`}><QrCode className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>

                {showQr && m.qr && (
                  <div className="mt-3 flex flex-col items-center">
                    <img src={m.qr} alt="QR" className="w-44 h-44 rounded-lg" />
                    <a href={m.qr} download={`${m.label}-qr.png`} className="mt-1.5 text-[10px] text-zinc-500 hover:text-white inline-flex items-center gap-1"><Download className="w-3 h-3" /> PNG</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent supporters — social proof from real tip webhooks (#529) */}
      {supporters.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
            <Heart className="w-3 h-3 text-red-500 fill-red-500" /> {t("recentTitle")}
          </h2>
          <div className="space-y-1.5">
            {supporters.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 border border-zinc-800/70 bg-black/20 rounded-lg px-3 py-2">
                <span className="text-base shrink-0" aria-hidden>💜</span>
                <span className="text-sm text-zinc-200 truncate flex-1">{s.name || t("anon")}</span>
                {s.amount != null && (
                  <span className="text-xs font-mono font-semibold text-red-300 shrink-0">
                    {s.amount.toLocaleString(nf)}{s.amountLabel ? ` ${s.amountLabel}` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shareable page QR — drop one code into OBS / a poster and it links here. */}
      {pageQr && (
        <div className="mt-6 border border-zinc-800 bg-black/30 rounded-xl p-3.5">
          <button onClick={() => setPageQrOpen((v) => !v)} className="w-full flex items-center gap-2 text-sm text-zinc-300 hover:text-white">
            <QrCode className="w-4 h-4 text-red-500" /> {t("pageQrTitle")}
            <span className="ml-auto text-[10px] text-zinc-600">{pageQrOpen ? "−" : "+"}</span>
          </button>
          {pageQrOpen && (
            <div className="mt-3 flex flex-col items-center">
              <img src={pageQr} alt="QR" className="w-48 h-48 rounded-lg" />
              <div className="mt-2 font-mono text-[10px] text-zinc-500 break-all text-center">{pageUrl}</div>
              <div className="mt-1.5 flex items-center gap-3">
                <button onClick={() => void copy("page", pageUrl)} className="text-[10px] text-zinc-400 hover:text-white inline-flex items-center gap-1">{copied === "page" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} {t("copyLink")}</button>
                <a href={pageQr} download="support-qr.png" className="text-[10px] text-zinc-400 hover:text-white inline-flex items-center gap-1"><Download className="w-3 h-3" /> PNG</a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick share */}
      {pageUrl && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest inline-flex items-center gap-1"><Share2 className="w-3 h-3" /> {t("share")}</span>
          {SHARE_TARGETS.map((s) => (
            <a key={s.key} href={s.href(pageUrl, t("shareText", { name: owner }))} target="_blank" rel="noreferrer" className="px-2.5 py-1 border border-zinc-800 text-zinc-300 hover:text-white hover:border-red-700 rounded-lg text-[11px]">{s.label}</a>
          ))}
          <button onClick={() => void copy("share", pageUrl)} className="px-2.5 py-1 border border-zinc-800 text-zinc-300 hover:text-white hover:border-red-700 rounded-lg text-[11px] inline-flex items-center gap-1">
            {copied === "share" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} {t("copyLink")}
          </button>
        </div>
      )}

      <p className="mt-6 text-center text-[10px] text-zinc-600">{t("disclaimer")}</p>
    </div>
  );
}
