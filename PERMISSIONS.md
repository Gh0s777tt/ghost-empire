# 🛡️ Uprawnienia — Admin vs Moderator

Ściąga, kto co może. Przydatne przy nadawaniu rang w `/admin#users`. Źródło prawdy: `ghost-empire-web/src/lib/permissions.ts` + funkcje `permission()` sekcji w `AdminClient.tsx`.

## Role

| Rola | Jak działa |
|---|---|
| **Admin** (`isAdmin`) | Ma **wszystkie** uprawnienia automatycznie (bypass). Plus sekcje admin-only (poniżej). |
| **Moderator** (`isModerator`) | Ma tylko te uprawnienia, które są w jego `modPermissions[]`. Sekcje filtrowane per-uprawnienie. |
| **Zwykły user** | Brak dostępu do `/admin`. |

## Uprawnienia moderatora (`modPermissions`)

| ID | Co daje | Grupa | Sekcja `/admin` |
|---|---|---|---|
| `grant_tokens` | Przyznawanie tokenów userom | EKONOMIA | Użytkownicy |
| `manage_shop` | Edycja sklepu + Harmonogram + Bot Discord | EKONOMIA | Sklep, Harmonogram, Bot |
| `deliver_orders` | Realizacja zamówień (pending orders) | EKONOMIA | Sklep |
| `create_events` | Tworzenie eventów + Predictions | EVENTY | Eventy, Predictions |
| `edit_events` | Edycja eventów | EVENTY | Eventy |
| `draw_events` | Losowanie zwycięzców | EVENTY | Eventy |
| `create_drops` | Tworzenie drop codes | EVENTY | Drops |
| `ban_users` | Banowanie userów | MODERACJA | Użytkownicy |
| `mute_users` | Mutowanie userów | MODERACJA | Użytkownicy |
| `mark_subs` | Flagowanie subskrybentów (role per-platforma) | MODERACJA | Użytkownicy |
| `view_audit` | Podgląd audit logu | MODERACJA | Audit log |

## Sekcje tylko dla Admina (`isAdmin`)

Niedostępne dla moderatorów niezależnie od `modPermissions`:

- **Merge duplikatów** — scalanie kont
- **Użytkownicy → role** — nadawanie ról admin/mod + ról per-platforma
- **Donacje** (Streamlabs)
- **Twitch / Kick / YouTube** — autoryzacja + eventy
- **Stream Alerts** — overlay OBS + token
- **Stream Goals** + **Subathon**
- **Battle Pass / Sezony**
- **Analityka** (heatmapa czatu)

## Uwaga bezpieczeństwa

- Admin ma pełną władzę nad ekonomią + rolami — nadawaj ostrożnie.
- Każda akcja admina/moda jest logowana w **Audit log** (kto / kiedy / co / IP).
- Konta admin/mod nie mogą być scalone (najpierw odbierz rolę).

> Aktualizuj ten plik, gdy zmienia się `MOD_PERMISSIONS` lub gating sekcji w `AdminClient.tsx`.
