"use client";
// src/app/auth/error/page.tsx
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AlertCircle } from "lucide-react";

function ErrorContent() {
  const t = useTranslations("authError");
  const params = useSearchParams();
  const error = params.get("error") ?? "Default";
  const messages: Record<string, string> = {
    Configuration: t("errConfiguration"),
    AccessDenied: t("errAccessDenied"),
    Verification: t("errVerification"),
    OAuthSignin: t("errOAuthSignin"),
    OAuthCallback: t("errOAuthCallback"),
    OAuthCreateAccount: t("errOAuthCreateAccount"),
    EmailCreateAccount: t("errEmailCreateAccount"),
    Callback: t("errCallback"),
    OAuthAccountNotLinked: t("errOAuthAccountNotLinked"),
    Default: t("errDefault"),
  };
  const message = messages[error] ?? messages.Default;

  return (
    <div className="max-w-md w-full text-center">
      <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border-2 border-red-500 bg-red-950/30">
        <AlertCircle className="w-8 h-8 text-red-400" />
      </div>
      <h1 className="font-display text-3xl text-red-500 mb-3">{t("title")}</h1>
      <p className="text-zinc-400 mb-8">{message}</p>
      <Link
        href="/auth/signin"
        className="inline-block px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-widest uppercase transition-all"
      >
        {t("retry")}
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
