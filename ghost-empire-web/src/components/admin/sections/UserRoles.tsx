"use client";
// src/components/admin/sections/UserRoles.tsx — lazily-loaded user-role + connection-role
// management (admin/mod/donator + per-platform sub/mod/VIP).
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Crown, Heart, UserCog, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MOD_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";
import { SectionCard, FieldInput } from "../shared";
import { apiGet, apiPost, apiPostStepUp, ApiError } from "@/lib/api-client";

function ModPermissionsPicker({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("admin.userRoles");
  // Localized label/desc from the namespace, falling back to the lib constant (PL).
  const tf = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);
  const grouped: Record<string, typeof MOD_PERMISSIONS[number][]> = {};
  for (const p of MOD_PERMISSIONS) {
    if (!grouped[p.group]) grouped[p.group] = [];
    grouped[p.group].push(p);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3" /> {t("permsTitle")}
        </label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => MOD_PERMISSIONS.forEach((p) => { if (!selected.has(p.id)) onToggle(p.id); })}
            className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 hover:text-green-400"
          >
            {t("selectAll")}
          </button>
          <span className="text-[9px] text-zinc-700">·</span>
          <button
            type="button"
            onClick={() => MOD_PERMISSIONS.forEach((p) => { if (selected.has(p.id)) onToggle(p.id); })}
            className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400"
          >
            {t("clearAll")}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(grouped).map(([groupKey, perms]) => {
          const group = PERMISSION_GROUPS[groupKey];
          return (
            <div key={groupKey} className="border border-zinc-800 bg-black/30 p-2.5">
              <div
                className="text-[9px] font-mono uppercase tracking-widest mb-2"
                style={{ color: group.color }}
              >
                {tf(`permGroup.${groupKey}`, group.label)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {perms.map((p) => {
                  const isSet = selected.has(p.id);
                  return (
                    <label
                      key={p.id}
                      title={tf(`perm.${p.id}.desc`, p.desc)}
                      className={cn(
                        "flex items-start gap-2 px-2 py-1.5 border cursor-pointer transition-all",
                        isSet
                          ? "border-blue-700 bg-blue-950/30 text-blue-200"
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSet}
                        onChange={() => onToggle(p.id)}
                        className="accent-blue-500 mt-0.5 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="text-xs block font-medium">{tf(`perm.${p.id}.label`, p.label)}</span>
                        <span className="text-[10px] text-zinc-500 leading-snug block">{tf(`perm.${p.id}.desc`, p.desc)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] font-mono text-zinc-600 mt-2 leading-snug">
        {t("permsNote")}
      </p>
    </div>
  );
}

export function UserRolesCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.userRoles");
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<"admin" | "moderator" | "donator">("moderator");
  const [enable, setEnable] = useState(true);
  const [addDonation, setAddDonation] = useState("");
  const [modPermissions, setModPermissions] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function togglePerm(id: string) {
    setModPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { target, role, enable };
      if (role === "donator" && addDonation) {
        body.addDonation = parseInt(addDonation);
      }
      if (role === "moderator" && enable) {
        body.modPermissions = Array.from(modPermissions);
      }
      // apiPostStepUp prompts for a 2FA code only if the server demands it (admin/moderator
      // role changes for a 2FA-enabled admin); donator changes behave like a plain POST.
      const data = await apiPostStepUp<{ user: { username: string | null; id: string } }>("/api/admin/user-roles", body);
      const user = data.user.username ?? data.user.id;
      onToast("ok", enable ? t("roleGranted", { role, user }) : t("roleRevoked", { role, user }));
      setTarget("");
      setAddDonation("");
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("title")} icon={UserCog}>
      <div className="space-y-3">
        <FieldInput
          label={t("userLabel")}
          value={target}
          onChange={setTarget}
          placeholder="gh0s77tt / 1500923809522258000 / cmpq74…"
        />

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            {t("roleLabel")}
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(["admin", "moderator", "donator"] as const).map((r) => {
              const meta = {
                admin: { label: "Admin", icon: Crown, color: "red" },
                moderator: { label: "Moderator", icon: ShieldCheck, color: "blue" },
                donator: { label: "Donator", icon: Heart, color: "yellow" },
              }[r];
              const Icon = meta.icon;
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-1.5",
                    role === r
                      ? `border-${meta.color}-500 bg-${meta.color}-600/20 text-${meta.color}-300`
                      : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300",
                  )}
                  style={
                    role === r
                      ? {
                          borderColor: { red: "#ef4444", blue: "#3b82f6", yellow: "#eab308" }[meta.color],
                          background: { red: "rgba(239,68,68,0.15)", blue: "rgba(59,130,246,0.15)", yellow: "rgba(234,179,8,0.15)" }[meta.color],
                          color: { red: "#fca5a5", blue: "#93c5fd", yellow: "#fde68a" }[meta.color],
                        }
                      : undefined
                  }
                >
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            {t("actionLabel")}
          </label>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setEnable(true)}
              className={cn(
                "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase",
                enable ? "border-green-500 bg-green-600/20 text-green-300" : "border-zinc-800 bg-zinc-950 text-zinc-500",
              )}
            >
              {t("grant")}
            </button>
            <button
              onClick={() => setEnable(false)}
              className={cn(
                "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase",
                !enable ? "border-red-500 bg-red-600/20 text-red-300" : "border-zinc-800 bg-zinc-950 text-zinc-500",
              )}
            >
              {t("revoke")}
            </button>
          </div>
        </div>

        {role === "donator" && enable && (
          <FieldInput
            label={t("donationAmount")}
            value={addDonation}
            onChange={setAddDonation}
            placeholder={t("donationPh")}
            type="number"
          />
        )}

        {role === "moderator" && enable && (
          <ModPermissionsPicker selected={modPermissions} onToggle={togglePerm} />
        )}

        <button
          onClick={submit}
          disabled={busy || pending || !target}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCog className="w-3.5 h-3.5" />}
          {t("apply")}
        </button>
      </div>
    </SectionCard>
  );
}

export function ConnectionRolesCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.userRoles");
  const [target, setTarget] = useState("");
  const [platform, setPlatform] = useState<"twitch" | "kick" | "discord" | "youtube">("twitch");
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [subTier, setSubTier] = useState<"T1" | "T2" | "T3" | "Prime">("T1");
  const [subMonths, setSubMonths] = useState("");
  const [isModerator, setIsModerator] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [busy, setBusy] = useState(false);
  // "loaded" means the form mirrors the connection's real DB state; submit is gated on it so
  // an untouched (all-false) form can never full-overwrite live flags — the #757 → #765 fix.
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "notfound" | "error">("idle");

  // Stable (useState setters are stable) so the prefill effect can depend on it without re-running.
  const resetFlags = useCallback(() => {
    setIsSubscriber(false);
    setSubTier("T1");
    setSubMonths("");
    setIsModerator(false);
    setIsVip(false);
  }, []);

  // Prefill the card with the connection's CURRENT sub/mod/VIP whenever the target or platform
  // changes (debounced, race-safe). Without this the form opens all-false and the POST writes
  // every flag, so marking one status silently wiped the other two.
  useEffect(() => {
    const tg = target.trim();
    if (!tg) {
      resetFlags();
      setLoadState("idle");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    const handle = setTimeout(async () => {
      try {
        const data = await apiGet<{
          found: boolean;
          connection?: { isSubscriber: boolean; subTier: string | null; subMonths: number; isModerator: boolean; isVip: boolean };
        }>(`/api/admin/connection-roles?target=${encodeURIComponent(tg)}&platform=${platform}`);
        if (cancelled) return;
        if (!data.found || !data.connection) {
          resetFlags();
          setLoadState("notfound");
          return;
        }
        const c = data.connection;
        setIsSubscriber(c.isSubscriber);
        setSubTier(c.subTier === "T2" || c.subTier === "T3" || c.subTier === "Prime" ? c.subTier : "T1");
        setSubMonths(c.subMonths ? String(c.subMonths) : "");
        setIsModerator(c.isModerator);
        setIsVip(c.isVip);
        setLoadState("loaded");
      } catch {
        if (cancelled) return;
        resetFlags();
        setLoadState("error");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [target, platform, resetFlags]);

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        target,
        platform,
        isSubscriber,
        isModerator,
        isVip,
      };
      if (isSubscriber) {
        body.subTier = subTier;
        if (subMonths) body.subMonths = parseInt(subMonths);
      }
      await apiPost("/api/admin/connection-roles", body);
      onToast("ok", t("statusUpdated", { platform, target }));
      setTarget("");
      setSubMonths("");
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("connTitle")} icon={ShieldCheck}>
      <div className="space-y-3">
        <FieldInput label={t("userShort")} value={target} onChange={setTarget} placeholder={t("userPh")} />

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            {t("platformLabel")}
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(["twitch", "kick", "discord", "youtube"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={cn(
                  "px-2 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                  platform === p
                    ? "border-purple-500 bg-purple-600/20 text-purple-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {target.trim() && (
          <p
            className={cn(
              "text-[10px] font-mono flex items-center gap-1.5",
              loadState === "loaded"
                ? "text-green-500"
                : loadState === "notfound"
                  ? "text-amber-500"
                  : loadState === "error"
                    ? "text-red-400"
                    : "text-zinc-500",
            )}
          >
            {loadState === "loading" && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
            {loadState === "loading"
              ? t("loadingStatus")
              : loadState === "loaded"
                ? t("loadedStatus")
                : loadState === "notfound"
                  ? t("noConnection")
                  : loadState === "error"
                    ? t("loadError")
                    : null}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <label className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isSubscriber}
              onChange={(e) => setIsSubscriber(e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">SUB</span>
          </label>
          <label className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isModerator}
              onChange={(e) => setIsModerator(e.target.checked)}
              className="accent-blue-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">MOD</span>
          </label>
          <label className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isVip}
              onChange={(e) => setIsVip(e.target.checked)}
              className="accent-pink-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">VIP</span>
          </label>
        </div>

        {isSubscriber && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
                Tier
              </label>
              <div className="grid grid-cols-4 gap-1">
                {(["T1", "T2", "T3", "Prime"] as const).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setSubTier(tier)}
                    className={cn(
                      "px-1 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                      subTier === tier
                        ? "border-purple-500 bg-purple-600/20 text-purple-300"
                        : "border-zinc-800 bg-zinc-950 text-zinc-500",
                    )}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
            <FieldInput label={t("subMonths")} value={subMonths} onChange={setSubMonths} type="number" placeholder="0" />
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || pending || !target || loadState !== "loaded"}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {t("update")}
        </button>
      </div>
    </SectionCard>
  );
}
