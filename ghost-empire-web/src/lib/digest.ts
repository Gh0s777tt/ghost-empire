// src/lib/digest.ts
// Weekly owner digest (#773) — PURE composer: portal stats in → { subject, html } out.
// Email-safe markup (tables + inline styles, no external CSS), dark-brand styled. All
// user-controlled strings pass through escapeHtml. The cron route gathers the stats.

export type DigestStats = {
  tenantName: string;
  tokenSymbol: string;
  portalUrl: string;
  newUsers: number;
  activeUsers: number;
  gtEarned: number;
  gtSpent: number;
  topEarner: { name: string; amount: number } | null;
  pendingOrders: number;
  openTickets: number;
};

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const nf = (n: number) => new Intl.NumberFormat("pl-PL").format(n);

function row(label: string, value: string, accent = false): string {
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #27272a;color:#a1a1aa;font-size:13px;">${label}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #27272a;color:${accent ? "#f87171" : "#fafafa"};font-size:13px;font-weight:700;text-align:right;white-space:nowrap;">${value}</td>
  </tr>`;
}

/** Compose the weekly digest email for a portal owner. Pure — fully unit-testable. */
export function composeDigest(s: DigestStats): { subject: string; html: string } {
  const name = escapeHtml(s.tenantName);
  const sym = escapeHtml(s.tokenSymbol);
  const subject = `${s.tenantName} — tygodniowy raport portalu`;

  const attention: string[] = [];
  if (s.pendingOrders > 0) attention.push(`${nf(s.pendingOrders)} zamówień czeka na realizację`);
  if (s.openTickets > 0) attention.push(`${nf(s.openTickets)} otwartych zgłoszeń`);

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111113;border:1px solid #27272a;">
  <tr><td style="padding:20px 24px;border-bottom:2px solid #e50914;">
    <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;color:#71717a;text-transform:uppercase;">Tygodniowy raport</div>
    <div style="font-family:Arial,sans-serif;font-size:22px;font-weight:900;color:#fafafa;margin-top:4px;">${name}</div>
  </td></tr>
  <tr><td style="padding:16px 24px;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row("Nowi członkowie", `+${nf(s.newUsers)}`)}
      ${row("Aktywni (dowolna transakcja)", nf(s.activeUsers))}
      ${row(`Zarobione ${sym}`, `+${nf(s.gtEarned)}`)}
      ${row(`Wydane ${sym}`, `−${nf(s.gtSpent)}`)}
      ${s.topEarner ? row("Top zarabiający", `${escapeHtml(s.topEarner.name)} · ${nf(s.topEarner.amount)} ${sym}`) : ""}
      ${s.pendingOrders > 0 ? row("Zamówienia do realizacji", nf(s.pendingOrders), true) : ""}
      ${s.openTickets > 0 ? row("Otwarte zgłoszenia", nf(s.openTickets), true) : ""}
    </table>
    ${attention.length ? `<div style="margin-top:14px;padding:10px 12px;background:#2a0e0e;border-left:3px solid #e50914;color:#fca5a5;font-size:12px;">Wymaga uwagi: ${attention.map(escapeHtml).join(" · ")}</div>` : ""}
    <div style="margin-top:18px;">
      <a href="${escapeHtml(s.portalUrl)}/admin" style="display:inline-block;background:#e50914;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:10px 18px;font-family:Arial,sans-serif;">Otwórz panel</a>
    </div>
  </td></tr>
  <tr><td style="padding:12px 24px;border-top:1px solid #27272a;font-family:Arial,sans-serif;font-size:11px;color:#52525b;">
    Ten raport wysyła Twój portal (ostatnie 7 dni). Zarządzaj nim w panelu administracyjnym.
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { subject, html };
}
