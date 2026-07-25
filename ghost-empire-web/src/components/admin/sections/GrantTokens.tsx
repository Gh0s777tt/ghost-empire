"use client";
// src/components/admin/sections/GrantTokens.tsx — lazily-loaded grant-tokens card.
import { useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard, FieldInput } from "../shared";
import { cn } from "@/lib/utils";
import { useTenantBranding } from "@/components/TenantBranding";
import { CHIP_SYMBOL, SHOP_CURRENCIES, isChipsCurrency } from "@/lib/shop-currency";
import { apiPostStepUp, ApiError } from "@/lib/api-client";

export function GrantTokensCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.grantTokens");
  const { tokenSymbol } = useTenantBranding();
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [currency, setCurrency] = useState<string>("GT");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const data = await apiPostStepUp<{ amount: number; user: { username: string | null; id: string }; newBalance: number }>(
        "/api/admin/grant-tokens",
        { target, amount: parseInt(amount), reason, currency },
      );
      // The toast names the currency that actually moved (%gt% resolves to the portal's
      // token symbol; the chips variant is the same sentence with 🪙).
      const vars = { delta: `${data.amount > 0 ? "+" : ""}${data.amount}`, user: data.user.username ?? data.user.id, balance: data.newBalance };
      onToast("ok", isChipsCurrency(currency) ? t("grantedChips", vars) : t("granted", vars));
      setAmount(""); setReason("");
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("title")} icon={Coins}>
      <div className="space-y-3">
        <FieldInput
          label={t("lblUser")}
          value={target}
          onChange={setTarget}
          placeholder="gh0s77tt / 1500923809522258000 / cmpq74…"
        />
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("lblCurrency")}</label>
          <div className="grid grid-cols-2 gap-1">
            {SHOP_CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "px-1 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                  currency === c
                    ? (isChipsCurrency(c) ? "border-amber-500 bg-amber-600/15 text-amber-300" : "border-red-500 bg-red-600/15 text-red-300")
                    : "border-zinc-800 bg-zinc-950 text-zinc-500",
                )}
              >{isChipsCurrency(c) ? `${CHIP_SYMBOL} ${c}` : tokenSymbol}</button>
            ))}
          </div>
          {/* Chips are the free casino currency — say so, so nobody hands them out thinking
              they moved the portal's real economy (they don't count to ranking/metrics). */}
          {isChipsCurrency(currency) && <p className="text-[10px] text-amber-400/80 mt-1 leading-snug">{t("currencyHintChips")}</p>}
        </div>
        <FieldInput
          label={t("lblAmount")}
          value={amount}
          onChange={setAmount}
          placeholder={t("phAmount")}
          type="number"
        />
        <FieldInput
          label={t("lblReason")}
          value={reason}
          onChange={setReason}
          placeholder={t("phReason")}
        />
        <button
          onClick={submit}
          disabled={busy || pending || !target || !amount}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}
          {t("submit")}
        </button>
      </div>
    </SectionCard>
  );
}
