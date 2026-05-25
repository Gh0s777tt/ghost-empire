"use client";
// src/app/auth/signin/page.tsx
import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState } from "react";
import { Ghost } from "lucide-react";

type Provider = {
  id: string;
  name: string;
  type: string;
  signinUrl: string;
  callbackUrl: string;
};

const PROVIDER_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; emoji: string; desc: string }
> = {
  twitch: {
    color: "#9146FF",
    bg: "rgba(145,70,255,0.1)",
    border: "rgba(145,70,255,0.5)",
    emoji: "💜",
    desc: "Połącz konto Twitch — automatyczne śledzenie subskrypcji",
  },
  discord: {
    color: "#5865F2",
    bg: "rgba(88,101,242,0.1)",
    border: "rgba(88,101,242,0.5)",
    emoji: "👾",
    desc: "Połącz Discord — synchronizacja rang i Ghost Tokens",
  },
};

export default function SignInPage() {
  const [providers, setProviders] = useState<Record<string, Provider> | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    getProviders().then(setProviders);
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
            <div
              className="w-20 h-20 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #E50914 0%, #8B0000 100%)",
                clipPath:
                  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              }}
            >
              <Ghost className="w-10 h-10 text-white" strokeWidth={2} />
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
            OFICJALNY PORTAL SPOŁECZNOŚCI
          </p>
        </div>

        {/* Login card */}
        <div
          className="border border-zinc-800 bg-zinc-950/90 backdrop-blur-sm p-8"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
          }}
        >
          <h2 className="font-display text-2xl text-white mb-2 tracking-wider">
            ZALOGUJ SIĘ
          </h2>
          <p className="text-zinc-500 text-xs mb-8">
            Wybierz platformę, żeby uzyskać dostęp do swojego profilu, sklepu i rankingu.
          </p>

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
                          ? "Łączenie..."
                          : `Zaloguj przez ${provider.name}`}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{config.desc}</div>
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
              CO DOSTANIESZ
            </p>
            <ul className="space-y-1.5">
              {[
                "👻 500 Ghost Tokens powitalnych",
                "📊 Pełen profil z statystykami",
                "🛍️ Dostęp do sklepu z nagrodami",
                "🏆 Ranking i system osiągnięć",
                "🎁 Daily questy z bonusami",
              ].map((item) => (
                <li key={item} className="text-xs text-zinc-400 flex items-center gap-2">
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-zinc-700 text-xs mt-6 font-mono">
          Logując się, akceptujesz zasady serwera.
          <br />
          <a href="/about" className="hover:text-red-400 transition-colors underline-offset-2 hover:underline">
            Dowiedz się więcej o Ghost Empire
          </a>
          <br />
          twitch.tv/gh0s77tt · kick.com/Gh0s77tt
        </p>
      </div>
    </div>
  );
}
