"use client";
// src/components/admin/sections/GrantTokens.tsx — lazily-loaded grant-tokens card.
import { useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard, FieldInput } from "../shared";
import { apiPost, ApiError } from "@/lib/api-client";

export function GrantTokensCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.grantTokens");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const data = await apiPost<{ amount: number; user: { username: string | null; id: string }; newBalance: number }>(
        "/api/admin/grant-tokens",
        { target, amount: parseInt(amount), reason },
      );
      onToast("ok", t("granted", { delta: `${data.amount > 0 ? "+" : ""}${data.amount}`, user: data.user.username ?? data.user.id, balance: data.newBalance }));
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
