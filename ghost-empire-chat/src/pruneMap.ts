// Okresowe czyszczenie map typu `Map<klucz, timestamp>` używanych jako cooldown
// (np. lastAward per widz). W długożyjącym procesie (Docker restart:unless-stopped)
// takie mapy rosłyby z liczbą UNIKALNYCH widzów bez ograniczenia. Wpis starszy niż
// maxAgeMs jest bezużyteczny (cooldown minął — kolejna wiadomość i tak utworzy nowy),
// więc bezpiecznie go usuwamy.

/** Startuje interwałowe usuwanie wpisów starszych niż maxAgeMs. `unref()`, więc nie
 *  trzyma procesu przy życiu. Zwraca handle (można clearInterval w testach). */
export function startTimestampPrune(
  map: Map<string, number>,
  maxAgeMs: number,
  everyMs: number = maxAgeMs,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    const cutoff = Date.now() - maxAgeMs;
    for (const [key, ts] of map) {
      if (ts < cutoff) map.delete(key);
    }
  }, everyMs);
  timer.unref?.();
  return timer;
}
