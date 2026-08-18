// src/app/overlay/live/page.tsx
// STAŁE źródło OBS: /overlay/live?token=<OVERLAY_TOKEN>
//
// Jeden adres wklejony do OBS raz na zawsze. Renderuje scenę oznaczoną jako AKTYWNA
// (`OverlayScene.isActive`), a przełączenie sceny w panelu albo przyciskiem na Stream Decku zmienia
// obraz na streamie bez dotykania źródła w OBS. Adresy `/overlay/scene/<id>` zostają bez zmian —
// są nadal przydatne, gdy ktoś chce mieć każdą scenę jako osobne źródło i przełączać je w OBS.
//
// Sama strona nic nie pobiera: dane (i bramka tokenu) siedzą w `/api/overlay/live`, które klient
// odpytuje cyklicznie — patrz komentarz w `LiveClient`.
import { LiveClient } from "./LiveClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Live Scene Overlay",
  robots: { index: false, follow: false },
};

export default function LiveOverlayPage() {
  return <LiveClient />;
}
