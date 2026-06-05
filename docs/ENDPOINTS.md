# 🌐 ENDPOINTS.md — API portalu

Spis tras API (`ghost-empire-web/src/app/api/**`), pogrupowany wg modelu autoryzacji. Skróty:

- **session** — wymaga zalogowanego usera (NextAuth)
- **admin** — `requireAdmin()` (pełny admin)
- **perm:X** — `requirePermission("X")` (admin LUB moderator z uprawnieniem X)
- **botSecret** — `Authorization: Bearer <BOT_SECRET>` (boty)
- **overlayToken** — `?token=<OVERLAY_TOKEN>` (źródła OBS, tylko odczyt)
- **public** — bez auth (lub własny podpis/sekret)

---

## 🆕 Nowe trasy — Studio (2026-06) — łącznie **102** trasy

**Admin (`requireAdmin`):**
| Trasa | Po co |
|---|---|
| `…/api/admin/moderation` | Config automoda (przekleństwa/CAPS/długość/flood/zalgo + akcje) |
| `…/api/admin/integrations` | Klucze API funkcji (AI / Sentry / OBS) — zapis w bazie, maskowane |
| `…/api/admin/setup-status` | Checklista konfiguracji na dashboardzie |
| `…/api/admin/backup` | Pobranie backupu JSON (config/katalog/salda, bez sekretów) |
| `…/api/admin/widgets` | CRUD własnych widgetów (generator) |

**Bot (`botSecret`):**
| `…/api/bot/moderation` | public GET — config automoda dla bota |
| `…/api/bot/active-prediction` | public GET — otwarty zakład (auto-pin na czacie) |
| `…/api/internal/emoji-combo` | POST — bot zgłasza wykryty emoji-combo |

**Overlay feeds (`overlayToken`):**
| `…/api/alerts/predictions` · `…/api/alerts/polls` | aktywny zakład / ankieta |
| `…/api/alerts/recent-events` | ostatni sub / donator / follower |
| `…/api/alerts/viewers` | liczba widzów (Helix, cache 12s) |
| `…/api/alerts/widget` | pojedynczy custom-widget po `id` |
| `…/api/alerts/emoji-combo` | świeży emoji-combo |

**Zmienione:** `admin/subathon` (+`appearance`), `admin/predictions`/`admin/polls` (+`accentColor`), `alerts/subathon` (+kolor/napis), `alerts/chat` + `internal/chat-feed` (+`emotes`/`badges`), `webhooks/twitch-eventsub` (+`channel.follow` v2).

---

## Auth / logowanie
| Trasa | Auth | Po co |
|---|---|---|
| `…/api/auth/[...nextauth]` | public | NextAuth (login/logout/sesja) — Twitch/Discord/Google/Kick |
| `…/api/auth/streamlabs` + `/callback` | session | OAuth Streamlabs (połączenie konta donacji) |

## Akcje użytkownika (session)
| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/shop/buy` | POST | Zakup przedmiotu (sprawdza wymagania: level/sub/mc/osiągnięcie) |
| `…/api/polls/vote` | POST | Głos w ankiecie (1/usera, zmienialny; rate-limit) |
| `…/api/predictions` · `…/api/predictions/[id]/wager` | GET/POST | Predykcje + obstawianie GT (auto-zamykanie po `closesAt`) |
| `…/api/wheel` · `…/api/wheel/spin` | GET/POST | Koło Fortuny — stan + zakręcenie (wydaje GT, rate-limit 20/min) |
| `…/api/games` | GET | Publiczna biblioteka gier (widoczne, wg czasu gry) |
| `…/api/events/join` · `…/api/events/raffle-tickets` | POST | Dołączenie do eventu / kupno losów raffle |
| `…/api/drops/claim` | POST | Odbiór drop-code z czatu |
| `…/api/seasons/claim` | POST | Odbiór nagrody Battle Pass |
| `…/api/tasks/claim` | POST | Odbiór nagrody za daily questa |
| `…/api/notifications` | GET/POST | Lista / oznaczanie powiadomień |
| `…/api/profile/social-links` | GET/POST | Linki społecznościowe profilu |
| `…/api/profile/discord-link-code` | POST | Kod do powiązania konta Discord |
| `…/api/profile/connections/unlink` · `…/link/[provider]` | POST | Odłączanie / łączenie platform |

## Admin
| Trasa | Auth | Po co |
|---|---|---|
| `…/api/admin/grant-tokens` | perm:grant_tokens | +/- tokeny userowi |
| `…/api/admin/user-roles` | admin | Role: admin / moderator / donator |
| `…/api/admin/connection-roles` | perm:mark_subs | Status sub/mod/VIP per platforma |
| `…/api/admin/reset-database` | admin | **Reset bazy** (wipe userów, fraza potwierdzająca) |
| `…/api/admin/shop` | perm:manage_shop | CRUD sklepu |
| `…/api/admin/seasons` | admin | Sezony + nagrody Battle Pass |
| `…/api/admin/achievements` | admin | CRUD osiągnięć + ręczne przyznawanie |
| `…/api/admin/polls` | admin | CRUD ankiet |
| `…/api/admin/codes` | admin | Pula drop-kodów (overlay) |
| `…/api/admin/events` · `/events/draw` | perm:create_events / draw_events | Eventy + losowanie |
| `…/api/admin/drops` | perm:create_drops | Drop-code'y |
| `…/api/admin/stream-goals` | admin | Stream Goals (overlay) |
| `…/api/admin/predictions` | perm:create_events | Tworzenie/rozliczanie predykcji (+ `toggle_announce`) |
| `…/api/admin/wheel` | admin | Konfiguracja Koła Fortuny (koszt, segmenty) + statystyki |
| `…/api/admin/mod-violations` | admin | Statystyki naruszeń moderacji + top recydywiści |
| `…/api/admin/games` | admin | Biblioteka gier — konfiguracja SteamID + sync + ukrywanie |
| `…/api/admin/webhooks-out` | admin | Webhooki wychodzące — CRUD + test (POST JSON na zewnętrzne URL) |
| `…/api/admin/donations` | admin | Donacje / dopasowania |
| `…/api/admin/streamlabs` | admin | Stan połączenia Streamlabs |
| `…/api/admin/subathon` | admin | Subathon (start/stop/±czas) |
| `…/api/admin/welcome` · `chat-commands` · `chat-timers` · `faq` · `song-requests` | admin | Konfiguracja bota czatu |
| `…/api/admin/schedule` | perm:manage_shop | Harmonogram streamów |
| `…/api/admin/bot-config` | perm:manage_shop | Config bota Discord |
| `…/api/admin/ban-user` | perm:ban_users | Ban/mute |
| `…/api/admin/merge-users` | admin | Scalanie duplikatów kont |
| `…/api/admin/deliver-order` | perm:deliver_orders | Realizacja zamówień sklepu |
| `…/api/admin/analytics` | admin | Heatmapa aktywności czatu |
| `…/api/admin/alerts` | admin | Ustawienia Stream Alerts + test |
| `…/api/admin/overlay-token` | admin | Token overlayów (do podglądów) |
| `…/api/admin/section-data` | admin/perm | Lazy-dane sekcji panelu (`?s=<sekcja>`) |
| `…/api/admin/twitch-streamer-auth` (+callback) · `twitch-eventsub` | admin | Autoryzacja streamera Twitch + subskrypcje EventSub |
| `…/api/admin/kick-streamer-auth` (+callback) · `kick-events` | admin | Autoryzacja streamera Kick + eventy |
| `…/api/admin/youtube-streamer-auth` (+callback) | admin | Autoryzacja konta YouTube |

## Bot (botSecret) — bot czatu pobiera konfigurację
| Trasa | Po co |
|---|---|
| `…/api/bot/config` | Parametry nagród (message/voice) |
| `…/api/bot/chat-commands` · `chat-timers` · `faq` · `welcome` | Komendy / timery / FAQ / powitania |
| `…/api/bot/moderation` | Konfiguracja automod (reguły + akcje) |
| `…/api/bot/active-prediction` | Otwarty zakład do re-anonsu na czacie (tylko `announceToChat`) |
| `…/api/bot/ai-reply` · `…/api/bot/imagine` | AI: odpowiedź `@bot` + generowanie obrazka `!imagine` (klucz server-side) |

## Internal (botSecret) — boty wysyłają zdarzenia
| Trasa | Po co |
|---|---|
| `…/api/internal/award` | Nagroda GT (Discord: wiadomości/voice) |
| `…/api/internal/chat-award` | Nagroda GT + heatmapa (czat Twitch/Kick/YT) |
| `…/api/internal/chat-feed` | Push wiadomości do overlaya czatu |
| `…/api/internal/song-request` | Dodanie utworu do kolejki `!sr` |
| `…/api/internal/link-discord` | Powiązanie konta Discord kodem |
| `…/api/internal/mod-violation` | Log naruszenia automod (po egzekucji) — statystyki + eskalacja |

## Źródła OBS (overlayToken, odczyt)
| Trasa | Overlay |
|---|---|
| `…/api/alerts/queue` | `/overlay` (alerty) |
| `…/api/alerts/goals` | `/overlay/goals` (cele + hype train) |
| `…/api/alerts/chat` | `/overlay/chat` (czat 3 platform) |
| `…/api/alerts/subathon` | `/overlay/subathon` (odliczanie) |
| `…/api/alerts/wheel` | `/overlay/wheel` (Koło Fortuny — animacja zakręcenia) |
| `…/api/chat/assets` | `/overlay/chat` (odznaki Twitch + emotki 7TV/BTTV/FFZ) |
| `…/api/codes/current` | `/overlay/codes` (rotacja kodów) |

## Webhooki / polling / cron (public + własny podpis)
| Trasa | Po co |
|---|---|
| `…/api/webhooks/twitch-eventsub` | EventSub Twitch (HMAC podpis) — suby/gifty/bity |
| `…/api/webhooks/kick-events` | Webhooki Kick — suby/gifty |
| `…/api/webhooks/paymedia` | Webhook płatności PayMedia (sekret) |
| `…/api/yt/poll-live-chat` | Polling YouTube Live Chat (super chaty / membery) |
| `…/api/cron/streamlabs-poll` | Cron (Vercel) — polling donacji Streamlabs (`CRON_SECRET`) |
| `…/api/cron/prune` | Cron (Vercel, 04:00) — czyszczenie starych rekordów transientowych (`CRON_SECRET`) |

---

> Helpery auth: `requireAdmin()`, `requirePermission(p)` (`@/lib/admin`), `verifyBotSecret()` (`@/lib/utils`), `isValidOverlayToken()` (`@/lib/alerts`). Uprawnienia moderatora: patrz [PERMISSIONS.md](../PERMISSIONS.md).
