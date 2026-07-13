# Dokumentacja Ghost Empire

Techniczna dokumentacja **[Ghost Empire](https://gitlab.com/Gh0s777tt/ghost-empire)** — portalu społeczności i ekosystemu botów dla streamerów (Twitch · Kick · YouTube · Discord), z jedną ekonomią **Ghost Tokens (GT)** i architekturą **white-label multi-tenant**.

!!! tip "Nowy tutaj?"
    Zacznij od **[Architektury](ARCHITECTURE.md)** (jak to działa), a potem **[Instalacji](ENV.md)**. Uruchomienie krok-po-kroku jest w [README repozytorium](https://gitlab.com/Gh0s777tt/ghost-empire#-szybki-start).

## Mapa dokumentacji

<div class="grid cards" markdown>

- :material-sitemap: **Architektura**

    Jak działa system, model danych, multi-tenant, przepływy.

    [:octicons-arrow-right-24: Przegląd](ARCHITECTURE.md) · [Podsystemy](SUBSYSTEMS.md) · [Per-tenant](PER-TENANT-IDENTITY.md) · [RLS](RLS.md)

- :material-api: **API portalu**

    Mapa tras `/api/*` — auth, ekonomia, eventy, webhooki.

    [:octicons-arrow-right-24: Endpointy](ENDPOINTS.md)

- :material-cog: **Instalacja i konfiguracja**

    Zmienne środowiskowe, setup właściciela, własna domena, backup.

    [:octicons-arrow-right-24: ENV](ENV.md) · [Owner setup](OWNER-SETUP.md) · [White-label](WHITE-LABEL-SETUP.md)

- :material-book-open-variant: **Przewodniki**

    Sterowanie OBS, smart-lights, raffle przez czat.

    [:octicons-arrow-right-24: OBS](OBS-CONTROL.md) · [Lights](LIGHTING.md) · [Raffle](RAFFLE-BOT.md)

</div>

## Stack

Next.js 16 · React 19 · TypeScript · Prisma 7 · Postgres (Supabase) · Tailwind 4 · NextAuth · Stripe · deploy na Vercel. Bot czatu (`ghost-empire-chat`) to osobny runtime (Node + tmi.js).

## Współpraca i wsparcie

- **Źródło prawdy:** [GitLab](https://gitlab.com/Gh0s777tt/ghost-empire) (rozwój, CI/CD). [GitHub](https://github.com/Gh0s777tt/ghost-empire) to mirror do odczytu.
- **Bezpieczeństwo:** zgłoszenia prywatnie — [SECURITY.md](https://gitlab.com/Gh0s777tt/ghost-empire/-/blob/main/SECURITY.md).
- **Historia zmian:** [CHANGELOG](https://gitlab.com/Gh0s777tt/ghost-empire/-/blob/main/CHANGELOG.md) · **plan:** [ROADMAP](https://gitlab.com/Gh0s777tt/ghost-empire/-/blob/main/ROADMAP.md).
