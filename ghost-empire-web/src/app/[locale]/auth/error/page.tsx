"use client";
// src/app/auth/error/page.tsx
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "Błąd konfiguracji serwera. Skontaktuj się z administratorem.",
  AccessDenied: "Odmowa dostępu. Twoje konto może być zablokowane — skontaktuj się z administratorem przez Discord.",
  Verification: "Link weryfikacyjny wygasł lub jest nieprawidłowy.",
  OAuthSignin: "Błąd podczas logowania przez OAuth.",
  OAuthCallback: "Błąd w odpowiedzi OAuth.",
  OAuthCreateAccount: "Nie udało się stworzyć konta.",
  EmailCreateAccount: "Nie udało się stworzyć konta email.",
  Callback: "Błąd wywołania zwrotnego.",
  OAuthAccountNotLinked: "Konto z tym emailem jest już połączone z innym providerem.",
  Default: "Wystąpił nieznany błąd.",
};

function ErrorContent() {
  const params = useSearchParams();
  const error = params.get("error") ?? "Default";
  const message = ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default;

  return (
    <div className="max-w-md w-full text-center">
      <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border-2 border-red-500 bg-red-950/30">
        <AlertCircle className="w-8 h-8 text-red-400" />
      </div>
      <h1 className="font-display text-3xl text-red-500 mb-3">BŁĄD LOGOWANIA</h1>
      <p className="text-zinc-400 mb-8">{message}</p>
      <Link
        href="/auth/signin"
        className="inline-block px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-widest uppercase transition-all"
      >
        SPRÓBUJ PONOWNIE
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-zinc-500">...</div>}>
        <ErrorContent />
      </Suspense>
    </div>
  );
}
