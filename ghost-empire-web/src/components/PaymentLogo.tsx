// src/components/PaymentLogo.tsx
// Recognizable branded mark for a support/payment method (#audit3). Crypto networks
// render their currency symbol in the brand colour (₿ / Ξ / ₮ …); banks/cards use a
// lucide icon; common tip links (PayPal / Ko-fi / Patreon …) get a coloured initial;
// anything unknown falls back to a generic coin/link icon. An admin-set custom `icon`
// (emoji) always wins. No trademarked brand SVGs are shipped — symbols + colours only.
import type { ReactNode } from "react";
import { Landmark, Link2, Coins } from "lucide-react";

type Kind = "link" | "crypto" | "bank";

// network/label keyword → { symbol, brand colour }. `dark` = symbol/text should be black.
const CRYPTO: Record<string, { sym: string; color: string; dark?: boolean; aliases?: string[] }> = {
  BTC: { sym: "₿", color: "#F7931A", aliases: ["BITCOIN"] },
  ETH: { sym: "Ξ", color: "#627EEA", aliases: ["ETHEREUM"] },
  LTC: { sym: "Ł", color: "#345D9D", aliases: ["LITECOIN"] },
  USDT: { sym: "₮", color: "#26A17B", aliases: ["TETHER"] },
  USDC: { sym: "$", color: "#2775CA" },
  SOL: { sym: "◎", color: "#9945FF", aliases: ["SOLANA"] },
  DOGE: { sym: "Ð", color: "#C2A633", dark: true, aliases: ["DOGECOIN"] },
  BNB: { sym: "BNB", color: "#F3BA2F", dark: true },
  ADA: { sym: "₳", color: "#0033AD", aliases: ["CARDANO"] },
  XRP: { sym: "XRP", color: "#23292F" },
  TRX: { sym: "TRX", color: "#EF0027", aliases: ["TRON"] },
};

const LINK_BRANDS: { re: RegExp; sym: string; color: string; dark?: boolean }[] = [
  { re: /paypal/i, sym: "PP", color: "#0070BA" },
  { re: /ko-?fi/i, sym: "Ko", color: "#FF5E5B" },
  { re: /patreon/i, sym: "P", color: "#FF424D" },
  { re: /(buy ?me ?a ?coffee|bmac|coffee)/i, sym: "☕", color: "#FFDD00", dark: true },
  { re: /tipe?e?/i, sym: "T", color: "#118C7E" },
  { re: /revolut/i, sym: "R", color: "#2B2D33" },
  { re: /throne/i, sym: "Th", color: "#7C3AED" },
];

function cryptoMatch(network: string | null, label: string) {
  const hay = `${network ?? ""} ${label}`.toUpperCase();
  for (const [key, c] of Object.entries(CRYPTO)) {
    if (hay.includes(key) || (c.aliases ?? []).some((a) => hay.includes(a))) return c;
  }
  return null;
}

export function PaymentLogo({
  kind, network, label, icon, size = 28,
}: { kind: Kind; network: string | null; label: string; icon?: string | null; size?: number }) {
  // 1) Admin-set custom emoji always wins.
  if (icon && icon.trim()) {
    return (
      <span className="shrink-0 inline-flex items-center justify-center text-center" style={{ width: size, height: size, fontSize: size * 0.8 }} aria-hidden>
        {icon}
      </span>
    );
  }

  const badge = (content: ReactNode, color: string, dark = false) => (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-lg font-bold leading-none"
      style={{ width: size, height: size, background: color, color: dark ? "#000" : "#fff" }}
      aria-hidden
    >
      {content}
    </span>
  );

  if (kind === "crypto") {
    const c = cryptoMatch(network, label);
    if (c) return badge(<span style={{ fontSize: size * (c.sym.length > 1 ? 0.34 : 0.52) }}>{c.sym}</span>, c.color, c.dark);
    return <Coins className="shrink-0" style={{ width: size, height: size, color: "#a1a1aa" }} aria-hidden />;
  }
  if (kind === "bank") {
    return <Landmark className="shrink-0" style={{ width: size, height: size, color: "#a1a1aa" }} aria-hidden />;
  }
  // link
  const brand = LINK_BRANDS.find((b) => b.re.test(label));
  if (brand) return badge(<span style={{ fontSize: size * (brand.sym.length > 1 ? 0.34 : 0.52) }}>{brand.sym}</span>, brand.color, brand.dark);
  return <Link2 className="shrink-0" style={{ width: size, height: size, color: "#71717a" }} aria-hidden />;
}
