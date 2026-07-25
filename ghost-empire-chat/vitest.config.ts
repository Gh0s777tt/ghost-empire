// Vitest dla bota — świadomie WŁASNY config, nie dziedziczony.
// Bez tego pliku vitest szuka konfiguracji w górę drzewa i potrafi złapać config
// aplikacji web (inne `setupFiles`, inne aliasy) — testy bota mają być hermetyczne
// i zależne wyłącznie od tego katalogu.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
