<!--
  SUMMARY.md — spis treści dla GitBooka (repo-root). To NIE jest nawigacja serwisu
  dokumentacji: opublikowany serwis buduje MkDocs Material z `mkdocs.yml` → `nav:`
  i obejmuje wyłącznie `docs/`. Plik jest generowany przez GitBooka
  („GitBook: Update content"), więc ręczne zmiany mogą zostać nadpisane przy kolejnej
  synchronizacji — jeśli tak się stanie, nanieś je ponownie.

  Audyt 2026-08, znalezisko „martwe dokumenty wciąż linkowane jako żywe":
   - `docs/README.md` NIE ISTNIEJE — link grupy „docs" był martwy; wskazuje teraz na
     realny `docs/index.md` (to samo, co MkDocs pokazuje jako „Wprowadzenie").
   - brakowały 4 strony obecne w `docs/`: CHIPS-CASINO, MAINTENANCE, PLAN-EKOSYSTEM, faq.
   - PLAN/PHASE2/PHASE3 oraz oba raporty to MIGAWKI — zebrane w sekcji „Archiwum",
     żeby nikt nie czytał ich jako bieżącego stanu. Żywy plan = ROADMAP.md.
-->

# Table of contents

* [README](README.md)
* [🗺️ Ghost Empire — Roadmap & propozycje optymalizacji](ROADMAP.md)
* [Changelog](CHANGELOG.md)
* [CLAUDE.md — working agreement for the Ghost Empire repo](CLAUDE.md)
* [🛡️ Uprawnienia — Admin vs Moderator](PERMISSIONS.md)
* [🔐 Security Policy — Ghost Empire](SECURITY.md)
* [docs — dokumentacja techniczna](docs/index.md)
  * [🏗️ ARCHITECTURE.md — jak to działa](docs/ARCHITECTURE.md)
  * [💾 BACKUP.md — off-site backup (dormant until configured)](docs/BACKUP.md)
  * [🌐 ENDPOINTS.md — API portalu](docs/ENDPOINTS.md)
  * [🔑 ENV.md — zmienne środowiskowe (kompletny spis)](docs/ENV.md)
  * [💡 IDEAS.md — backlog pomysłów + mini-specy](docs/IDEAS.md)
  * [💡 LIGHTING.md — Govee smart-light flash (dormant until configured)](docs/LIGHTING.md)
  * [🎛️ OBS-CONTROL.md — sterowanie OBS przez zdarzenia (PHASE 3C)](docs/OBS-CONTROL.md)
  * [🫵 OWNER-SETUP.md — actions only the owner can do](docs/OWNER-SETUP.md)
  * [Per-tenant viewer identity — design & migration runbook](docs/PER-TENANT-IDENTITY.md)
  * [🎟️ RAFFLE-BOT.md — chat-keyword raffle: wiring ghost-empire-chat](docs/RAFFLE-BOT.md)
  * [🔒 RLS.md — enable Row-Level Security in Supabase (defense-in-depth)](docs/RLS.md)
  * [🧩 SUBSYSTEMS.md — podsystemy money-critical (odds, limity, sinki)](docs/SUBSYSTEMS.md)
  * [White-label: podpięcie własnej domeny do portalu](docs/WHITE-LABEL-SETUP.md)
  * [🎰 CHIPS-CASINO.md — runbook: kasyno na „Żetonach”](docs/CHIPS-CASINO.md)
  * [🛠️ MAINTENANCE.md — utrzymanie i operacje (DevOps)](docs/MAINTENANCE.md)
  * [🧭 PLAN-EKOSYSTEM.md — program rozwoju (portal + 2 rozszerzenia)](docs/PLAN-EKOSYSTEM.md)
  * [❓ FAQ](docs/faq.md)
* [ghost-empire-chat 🤖💬](ghost-empire-chat/README.md)
* [🗄️ Archiwum — migawki, NIE bieżący stan](PLAN.md)
  * [🧭 PLAN.md — analiza + plan ukończenia (migawka 2026-06-11)](PLAN.md)
  * [Phase 2 — Roadmap & Setup Instructions (zamknięte 2026-05)](PHASE2.md)
  * [Phase 3 — Streaming bot ecosystem (migawka 2026-06-06)](PHASE3.md)
  * [AUDIT\_REPORT.md — E-Forge / Ghost Empire (2026-07-02)](AUDIT_REPORT.md)
  * [DISCOVERY\_REPORT.md — E-Forge / Ghost Empire (2026-07-03)](DISCOVERY_REPORT.md)
