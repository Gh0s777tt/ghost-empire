"use client";
// src/components/admin/sections/CreateDrop.tsx — lazily-loaded create-drop card.
import { useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard, FieldInput } from "../shared";
import { apiPost, ApiError } from "@/lib/api-client";
import { useTenantBranding } from "@/components/TenantBranding";

export function CreateDropCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.createDrop");
  const { tokenSymbol } = useTenantBranding();
  const [code, setCode] = useState("");
  const [reward, setReward] = useState("500");
  const [bonusReward, setBonusReward] = useState("1000");
  const [bonusSlots, setBonusSlots] = useState("10");
  const [expiresInMinutes, setExpiresInMinutes] = useState("60");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const data = await apiPost<{ drop: { code: string } }>("/api/admin/drops", {
        code: code || undefined,
        reward: parseInt(reward),
        bonusReward: parseInt(bonusReward),
        bonusSlots: parseInt(bonusSlots),
        expiresInMinutes: parseInt(expiresInMinutes),
      });
      onToast("ok", t("created", { code: data.drop.code }));
      setCode("");
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("title")} icon={Gift}>
      <div className="space-y-3">
        <FieldInput
          label={t("lblCode")}
          value={code}
          onChange={(v) => setCode(v.toUpperCase())}
          placeholder={t("phCode")}
        />
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label={t("lblReward", { sym: tokenSymbol })} value={reward} onChange={setReward} type="number" min={0} />
          <FieldInput label={t("lblBonus", { sym: tokenSymbol })} value={bonusReward} onChange={setBonusReward} type="number" min={0} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label={t("lblBonusSlots")} value={bonusSlots} onChange={setBonusSlots} type="number" min={0} />
          <FieldInput label={t("lblExpires")} value={expiresInMinutes} onChange={setExpiresInMinutes} type="number" min={1} />
        </div>
        <button
          onClick={submit}
          disabled={busy || pending || !reward}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
          {t("submit")}
        </button>
      </div>
    </SectionCard>
  );
}
