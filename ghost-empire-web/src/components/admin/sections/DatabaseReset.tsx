"use client";
// src/components/admin/sections/DatabaseReset.tsx — lazily-loaded danger-zone DB reset.
import { useState } from "react";
import { signOut } from "next-auth/react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { SectionCard } from "../shared";

export function DatabaseResetCard({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const PHRASE = "USUŃ WSZYSTKO";
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const armed = confirm.trim() === PHRASE;

  async function submit() {
    if (!armed) return;
    if (!window.confirm(
      "OSTATNIE OSTRZEŻENIE\n\nTo NIEODWRACALNIE usunie WSZYSTKICH użytkowników i ich dane " +
      "(także Twoje konto — zalogujesz się ponownie). Konfiguracja i katalog zostają.\n\nKontynuować?",
    )) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reset-database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirm.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
        setBusy(false);
        return;
      }
      onToast("ok", `Baza zresetowana — usunięto ${data.deletedUsers} użytkowników. Wylogowuję…`);
      // The acting admin's account is gone too — sign out and back to landing.
      setTimeout(() => signOut({ callbackUrl: "/welcome" }), 1800);
    } catch {
      onToast("err", "Błąd sieci");
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Reset bazy danych" icon={AlertTriangle}>
      <div className="space-y-3 border border-red-800 bg-red-950/20 p-4">
        <p className="text-sm text-red-300 font-bold flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Strefa niebezpieczna — operacja NIEODWRACALNA
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Usuwa <strong className="text-white">wszystkich użytkowników</strong> i ich dane: konta i logowania,
          połączone platformy, tokeny i transakcje, osiągnięcia, questy, progres battle passa, zakłady,
          udziały w eventach, powiadomienia i social linki. Czyści też kolejkę alertów, feed czatu oraz logi
          zdarzeń (Twitch / Kick / YouTube). Użytkownicy zalogują się od nowa (z bonusem powitalnym).
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-green-300">Zostaje:</strong> konfiguracja i katalog — sklep, definicje eventów,
          osiągnięć, questów i dropów, sezony battle passa, komendy / timery / FAQ czatu, harmonogram, ustawienia
          alertów, integracje (Twitch / Kick / YouTube / Streamlabs) oraz audit log. Konto właściciela wraca jako
          admin po ponownym zalogowaniu.
        </p>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Wpisz dokładnie <span className="text-red-400 font-bold">{PHRASE}</span>, aby odblokować
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={PHRASE}
            className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white focus:border-red-500 outline-hidden"
          />
        </div>
        <button
          onClick={submit}
          disabled={busy || !armed}
          className="w-full px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Zresetuj bazę danych
        </button>
      </div>
    </SectionCard>
  );
}
