# FAQ

### Czym są Ghost Tokens (GT)?
Wirtualna waluta portalu. Widzowie zdobywają GT za aktywność (czat, voice, suby, gifty, bity, donacje, daily questy, eventy) i wymieniają je w sklepie na nagrody cyfrowe i fizyczne. **GT nie mają wartości pieniężnej** i nie są wymienialne na prawdziwe środki.

### Czym są Żetony (🪙 Chips) i czy kasyno to hazard?
Żetony to **odrębna, w pełni darmowa** waluta używana **wyłącznie** w kasynie, kole fortuny, pojedynkach i napadach. **Nie można ich kupić, wpłacić, wypłacić ani wymienić** na pieniądze, GT czy nagrody o wartości rynkowej — zdobywa się je za darmo (dzienny bonus). Gry kasyna są więc **rozrywką na darmowe żetony, a nie hazardem na pieniądze**: brak wypłaty gotówki i nagród o wartości rynkowej. Dostęp wymaga potwierdzenia **pełnoletności (18+)**. Za żetony kupisz tylko kosmetyki bez wartości rynkowej. To świadome **przecięcie pętli wartości** (patrz [CHIPS-CASINO](CHIPS-CASINO.md)) — pełne zasady w [Regulaminie](https://ghost-empire-web.vercel.app/terms) §3.

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

### Czy są rozszerzenia przeglądarkowe?
Tak — dwa dodatki przenoszące portal wprost na streamy: **NX Companion** (saldo GT, questy i drop-code'y jako overlay na Twitch/Kick) oraz **NX Chat Tools** (narzędzia moderacji + emotki 7TV/BTTV/FFZ, command palette ⌘K). Przegląd i status publikacji: strona [`/rozszerzenia`](https://ghost-empire-web.vercel.app/rozszerzenia) na portalu.
