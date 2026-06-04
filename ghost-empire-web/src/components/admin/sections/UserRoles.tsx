"use client";
// src/components/admin/sections/UserRoles.tsx — lazily-loaded user-role + connection-role
// management (admin/mod/donator + per-platform sub/mod/VIP).
import { useState } from "react";
import { ShieldCheck, Crown, Heart, UserCog, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOD_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";
import { SectionCard, FieldInput } from "../shared";

function ModPermissionsPicker({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const grouped: Record<string, typeof MOD_PERMISSIONS[number][]> = {};
  for (const p of MOD_PERMISSIONS) {
    if (!grouped[p.group]) grouped[p.group] = [];
    grouped[p.group].push(p);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3" /> Uprawnienia moderatora
        </label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => MOD_PERMISSIONS.forEach((p) => !selected.has(p.id) && onToggle(p.id))}
            className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 hover:text-green-400"
          >
            Zaznacz wszystkie
          </button>
          <span className="text-[9px] text-zinc-700">·</span>
          <button
            type="button"
            onClick={() => MOD_PERMISSIONS.forEach((p) => selected.has(p.id) && onToggle(p.id))}
            className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400"
          >
            Wyczyść
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
                {group.label}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {perms.map((p) => {
                  const isSet = selected.has(p.id);
                  return (
                    <label
                      key={p.id}
                      title={p.desc}
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
                        <span className="text-xs block font-medium">{p.label}</span>
                        <span className="text-[10px] text-zinc-500 leading-snug block">{p.desc}</span>
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
        Admini mają wszystkie uprawnienia automatycznie. Moderatorzy — tylko zaznaczone.
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
      const res = await fetch("/api/admin/user-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast(
          "ok",
          `${enable ? "Nadana" : "Odebrana"} rola ${role} dla ${data.user.username ?? data.user.id}`,
        );
        setTarget("");
        setAddDonation("");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Role usera (admin/mod/donator)" icon={UserCog}>
      <div className="space-y-3">
        <FieldInput
          label="User (username, Discord ID lub ID konta)"
          value={target}
          onChange={setTarget}
          placeholder="gh0s77tt / 1500923809522258000 / cmpq74…"
        />

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Rola
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
            Akcja
          </label>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setEnable(true)}
              className={cn(
                "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase",
                enable ? "border-green-500 bg-green-600/20 text-green-300" : "border-zinc-800 bg-zinc-950 text-zinc-500",
              )}
            >
              ✓ Nadaj
            </button>
            <button
              onClick={() => setEnable(false)}
              className={cn(
                "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase",
                !enable ? "border-red-500 bg-red-600/20 text-red-300" : "border-zinc-800 bg-zinc-950 text-zinc-500",
              )}
            >
              ✗ Odbierz
            </button>
          </div>
        </div>

        {role === "donator" && enable && (
          <FieldInput
            label="Kwota donacji (opcjonalna, sumuje się)"
            value={addDonation}
            onChange={setAddDonation}
            placeholder="np. 50 (PLN)"
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
          Zastosuj
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
  const [target, setTarget] = useState("");
  const [platform, setPlatform] = useState<"twitch" | "kick" | "discord" | "youtube">("twitch");
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [subTier, setSubTier] = useState<"T1" | "T2" | "T3" | "Prime">("T1");
  const [subMonths, setSubMonths] = useState("");
  const [isModerator, setIsModerator] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [busy, setBusy] = useState(false);

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
      const res = await fetch("/api/admin/connection-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast("ok", `Status ${platform} zaktualizowany dla ${target}`);
        setTarget("");
        setSubMonths("");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Status na platformie (sub/mod/VIP)" icon={ShieldCheck}>
      <div className="space-y-3">
        <FieldInput label="User" value={target} onChange={setTarget} placeholder="username / Discord ID / ID konta" />

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Platforma
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
                {(["T1", "T2", "T3", "Prime"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSubTier(t)}
                    className={cn(
                      "px-1 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                      subTier === t
                        ? "border-purple-500 bg-purple-600/20 text-purple-300"
                        : "border-zinc-800 bg-zinc-950 text-zinc-500",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <FieldInput label="Miesięcy sub" value={subMonths} onChange={setSubMonths} type="number" placeholder="0" />
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || pending || !target}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          Zaktualizuj
        </button>
      </div>
    </SectionCard>
  );
}
