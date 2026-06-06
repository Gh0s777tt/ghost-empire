"use client";
// src/app/auth/signin/page.tsx
import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type Provider = {
  id: string;
  name: string;
  type: string;
  signinUrl: string;
  callbackUrl: string;
};

const PROVIDER_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; emoji: string }
> = {
  twitch: { color: "#9146FF", bg: "rgba(145,70,255,0.1)", border: "rgba(145,70,255,0.5)", emoji: "💜" },
  discord: { color: "#5865F2", bg: "rgba(88,101,242,0.1)", border: "rgba(88,101,242,0.5)", emoji: "👾" },
  kick: { color: "#53FC18", bg: "rgba(83,252,24,0.08)", border: "rgba(83,252,24,0.5)", emoji: "🟢" },
  google: { color: "#FF0000", bg: "rgba(255,0,0,0.08)", border: "rgba(255,0,0,0.5)", emoji: "📺" },
};

export default function SignInPage() {
  const t = useTranslations("signin");
  const [providers, setProviders] = useState<Record<string, Provider> | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  const errorMessages: Record<string, string> = {
    OAuthSignin: t("errOAuthSignin"),
    OAuthCallback: t("errOAuthCallback"),
    OAuthCreateAccount: t("errOAuthCreateAccount"),
    Callback: t("errCallback"),
    OAuthAccountNotLinked: t("errOAuthAccountNotLinked"),
    AccessDenied: t("errAccessDenied"),
    Configuration: t("errConfiguration"),
  };
  const providerDesc: Record<string, string> = {
    twitch: t("descTwitch"),
    discord: t("descDiscord"),
    kick: t("descKick"),
    google: t("descGoogle"),
  };
  const perks = [t("perk1"), t("perk2"), t("perk3"), t("perk4"), t("perk5")];

  useEffect(() => {
    getProviders().then(setProviders);
    setOrigin(window.location.origin);
    // NextAuth redirects back with ?error=<code> when an OAuth attempt fails.
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(e);
  }, []);

  const handleSignIn = async (providerId: string) => {
    setLoading(providerId);
    await signIn(providerId, { callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      {/* Background atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-20"
          style={{ background: "radial-gradient(circle, #E50914, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] opacity-10"
          style={{ background: "radial-gradient(circle, #8B0000, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-5">
            <div className="w-20 h-20 overflow-hidden rounded-2xl ring-2 ring-red-600/40 shadow-[0_0_50px_rgba(229,9,20,0.35)]">
              <img src="/brand/skull.png" alt="GH0ST EMPIRE" className="w-full h-full object-cover" />
            </div>
          </div>
          <h1
            className="font-display text-5xl text-white mb-2"
            style={{
              textShadow: "2px 0 0 rgba(229,9,20,0.7), -2px 0 0 rgba(139,0,0,0.5)",
            }}
          >
            GH0ST EMPIRE
          </h1>
          <p className="text-zinc-500 text-sm font-mono tracking-widest">
            {t("tagline")}
          </p>
        </div>

        {/* Login card */}
        <div
          className="border border-zinc-800 bg-zinc-950/90 backdrop-blur-xs p-8"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
          }}
        >
          <h2 className="font-display text-2xl text-white mb-2 tracking-wider">
            {t("title")}
          </h2>
          <p className="text-zinc-500 text-xs mb-8">
            {t("subtitle")}
          </p>

          {error && (
            <div className="mb-6 border border-red-700 bg-red-950/40 text-red-200 text-xs p-3 leading-relaxed">
              <p>{errorMessages[error] ?? t("errFallback", { error })}</p>
              {["OAuthSignin", "OAuthCallback", "Callback", "Configuration"].includes(error) && origin && (
                <div className="mt-3 border-t border-red-800/60 pt-3 space-y-2">
                  <p className="font-semibold text-red-300/90">
                    {t("redirectHint")}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="break-all rounded-sm bg-black/50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
                      {origin}/api/auth/callback/twitch
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(`${origin}/api/auth/callback/twitch`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="shrink-0 text-red-300 underline hover:text-white"
                    >
                      {copied ? t("copied") : t("copy")}
                    </button>
                  </div>
                  <ul className="space-y-0.5 font-mono text-[11px] text-zinc-400">
                    <li className="break-all">{origin}/api/auth/callback/kick</li>
                    <li className="break-all">{origin}/api/auth/callback/discord</li>
                    <li className="break-all">{origin}/api/auth/callback/google</li>
                  </ul>
                  <p className="text-zinc-400">
                    {t("vercelHint")}{" "}
                    <code className="rounded-sm bg-black/50 px-1 font-mono">NEXTAUTH_URL</code> ={" "}
                    <code className="break-all rounded-sm bg-black/50 px-1 font-mono">{origin}</code>{" "}
                    {t("vercelHintEnd")}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {providers &&
              Object.values(providers).map((provider) => {
                const config = PROVIDER_CONFIG[provider.id];
                if (!config) return null;

                return (
                  <button
                    key={provider.id}
                    onClick={() => handleSignIn(provider.id)}
                    disabled={loading === provider.id}
                    className="w-full p-4 border text-left transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-wait flex items-center gap-4 group"
                    style={{
                      borderColor: config.border,
                      background: config.bg,
                    }}
                  >
                    <span className="text-2xl">{config.emoji}</span>
                    <div className="flex-1">
                      <div className="font-bold text-white font-mono">
                        {loading === provider.id
                          ? t("connecting")
                          : t("signInWith", { name: provider.name })}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{providerDesc[provider.id]}</div>
                    </div>
                    <div
                      className="w-2 h-8 opacity-60 group-hover:opacity-100 transition-opacity"
                      style={{ background: config.color }}
                    />
                  </button>
                );
              })}
          </div>

          {/* Features list */}
          <div className="mt-8 pt-6 border-t border-zinc-800">
            <p className="text-[10px] font-mono tracking-widest text-zinc-600 mb-3">
              {t("whatYouGet")}
            </p>
            <ul className="space-y-1.5">
              {perks.map((item) => (
                <li key={item} className="text-xs text-zinc-400 flex items-center gap-2">
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-zinc-700 text-xs mt-6 font-mono">
          {t.rich("footerAccept", {
            terms: (c) => (
              <Link href="/terms" className="text-zinc-500 hover:text-red-400 underline-offset-2 hover:underline">{c}</Link>
            ),
            privacy: (c) => (
              <Link href="/privacy" className="text-zinc-500 hover:text-red-400 underline-offset-2 hover:underline">{c}</Link>
            ),
          })}
          <br />
          <Link href="/about" className="hover:text-red-400 transition-colors underline-offset-2 hover:underline">
            {t("learnMore")}
          </Link>
          <br />
          twitch.tv/gh0s77tt · kick.com/Gh0s77tt
        </p>
      </div>
    </div>
  );
}
