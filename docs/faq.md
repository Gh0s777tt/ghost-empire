# FAQ

### Czym są Ghost Tokens (GT)?
Wirtualna waluta portalu. Widzowie zdobywają GT za aktywność (czat, voice, suby, gifty, bity, donacje, daily questy, eventy) i wymieniają je w sklepie na nagrody cyfrowe i fizyczne. **GT nie mają wartości pieniężnej** i nie są wymienialne na prawdziwe środki.

### Czy muszę łączyć wszystkie platformy?
Nie. Portal działa z jednym providerem (np. samym Twitchem). Im więcej połączeń (Discord/Google/Kick), tym więcej ścieżek zdobywania GT i jedno wspólne saldo — konta łączą się po e-mailu.

### Czy da się uruchomić lokalnie bez Supabase / OAuth / Stripe?
Tak. Wystarczy lokalny Postgres 16 + minimalny `.env.local` (`NEXTAUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `BOT_SECRET`). Bez OAuth nie zalogujesz się przez providerów; bez Stripe checkout zwraca 503 (portal działa jako pojedynczy tenant). Szczegóły: [ENV](ENV.md).

### Jak wykrywane są suby, gifty, bity i donacje?
Automatycznie: Twitch/Kick przez **webhooki** (EventSub / Kick events), Streamlabs + YouTube Super Chat przez **polling**. Zdarzenie → przyznanie GT + odznaki, bez ręcznej obsługi. Zob. [Architektura](ARCHITECTURE.md) i [Endpointy](ENDPOINTS.md).

### Co to jest tryb white-label / multi-tenant?
Ten sam kod obsługuje wiele portali (marka „E-Forge"). Każdy tenant ma własną walutę, branding, domenę i dane, odseparowane po `tenantId` (host → tenant). Zob. [Per-tenant identity](PER-TENANT-IDENTITY.md) i [White-label setup](WHITE-LABEL-SETUP.md).

### Gdzie jest bot czatu?
`ghost-empire-chat` to **osobny runtime** (Node + tmi.js, zwykle w Dockerze). Łączy się z API portalu Bearerem `BOT_SECRET`. Bot Discorda (`E-Bot`) to osobne repo.

### Jak działa moderacja (automod)?
Bot filtruje czat wg konfiguracji z portalu: linki (whitelista domen), słowa/regexy, fale spamu, eskalacja kar. Ustawienia są w panelu `/admin`. Zob. [SUBSYSTEMS](SUBSYSTEMS.md).

### Jak zgłosić błąd lub podatność?
Zwykłe błędy — przez repozytorium na GitLab. **Podatności bezpieczeństwa zgłaszaj prywatnie** (nie publicznym issue) — zob. [SECURITY.md](https://gitlab.com/Gh0s777tt/ghost-empire/-/blob/main/SECURITY.md).

### Gdzie deployuje się portal?
Web na **Vercel** (auto-deploy z gałęzi `main`). Bot czatu — na własnym hoście (Docker `--restart unless-stopped`). CI/CD i źródło prawdy: **GitLab**.
