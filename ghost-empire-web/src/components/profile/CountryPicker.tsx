"use client";
// src/components/profile/CountryPicker.tsx
// Inline country picker on the user's own profile (#540): shows the current flag and
// a compact <select> (localized country names via Intl.DisplayNames). Saving persists
// via /api/profile/country and refreshes. Empty option clears it.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { COUNTRY_CODES, countryFlag } from "@/lib/countries";
import { apiPost } from "@/lib/api-client";

export function CountryPicker({ initialCountry }: { initialCountry: string | null }) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const router = useRouter();
  const [country, setCountry] = useState(initialCountry ?? "");
  const [busy, setBusy] = useState(false);

  // Localized, alphabetically-sorted country names for the dropdown.
  const options = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([locale], { type: "region" }); } catch { dn = null; }
    return COUNTRY_CODES.map((c) => ({ code: c, name: dn?.of(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  async function change(next: string) {
    const prev = country;
    setCountry(next);
    setBusy(true);
    try {
      await apiPost("/api/profile/country", { country: next });
      router.refresh();
    } catch {
      setCountry(prev); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      {country && <span className="text-base leading-none" aria-hidden>{countryFlag(country)}</span>}
      <select
        value={country}
        onChange={(e) => void change(e.target.value)}
        disabled={busy}
        aria-label={t("countryLabel")}
        className="bg-transparent border border-zinc-800 rounded text-[10px] text-zinc-400 hover:text-white px-1 py-0.5 outline-none cursor-pointer disabled:opacity-50 max-w-[9rem]"
      >
        <option value="" className="bg-zinc-950">{t("countryNone")}</option>
        {options.map((c) => (
          <option key={c.code} value={c.code} className="bg-zinc-950">{c.name}</option>
        ))}
      </select>
    </span>
  );
}
