// src/app/[locale]/admin/layout.tsx
//
// Why this layout exists: the root [locale]/layout.tsx ships the client i18n bundle
// WITHOUT the ~84 KB `admin` namespace to keep viewer pages lean, re-enabling it only
// for admin routes. That gate keyed off an `x-pathname` request header — which does NOT
// survive next-intl's internal locale rewrite in production, so `isAdminRoute` was false
// on /admin and every admin client component (AdminClient, sections, AdminAssistant…)
// rendered raw keys like `admin.secDashboard`.
//
// This route-scoped layout re-provides the full message catalog (incl. `admin`) via a
// nested NextIntlClientProvider for the /admin subtree only. It does not depend on any
// header, so the admin namespace is guaranteed present here — while the 84 KB stays off
// every non-admin route. Locale/timeZone/formats are inherited from the parent provider.
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
