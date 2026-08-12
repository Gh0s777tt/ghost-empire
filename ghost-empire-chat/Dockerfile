# ghost-empire-chat — long-running chat bot (Twitch + Kick + YouTube).
# Outbound-only (no inbound ports): connects to each platform's chat and the portal.
#
#   docker build -t ghost-empire-chat .
#   docker run -d --restart unless-stopped --env-file .env \
#     -v ghost-empire-chat-tokens:/app/tokens ghost-empire-chat
#
# Node 22+ is required (global WebSocket for Kick/Pusher, global fetch, --env-file).
FROM node:22-slim

WORKDIR /app

# Deps first for layer caching. tsx (devDep) runs the TS directly — no build step,
# so we install all deps (not --omit=dev).
# npm ci BEZ fallbacku `|| npm install` (audyt 2026-08, finding low/8): fallback po cichu
# degradował build z instalacji przypiętej lockfile'em do świeżego resolvingu (stale/brakujący
# package-lock.json, mismatch wersji npm) — obraz mógł wieźć wersje zależności, których lockfile
# nigdy nie zatwierdził. Niespójny lock ma wywalić build GŁOŚNO; stąd też COPY bez globa `*`,
# żeby brak lockfile'a zatrzymał build już na tym kroku.
COPY package.json package-lock.json ./
RUN npm ci

# App source.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production

# Kick ROTATES its refresh token on every refresh; the bot persists the live one to
# .kick-tokens.json. On an ephemeral host that file is lost on redeploy → Kick replies
# break until re-auth. Point it at a mounted volume to survive restarts:
ENV KICK_TOKEN_STORE=/app/tokens/.kick-tokens.json
VOLUME ["/app/tokens"]

# ŚWIADOMIE bez `USER node` (audyt 2026-08, finding low/8): istniejące wdrożenia mają wolumen
# ghost-empire-chat-tokens utworzony przez ten obraz jako root-owned — samo dodanie USER
# odebrałoby botowi zapis .kick-tokens.json na JUŻ zamontowanych wolumenach i po cichu zabiło
# odpowiedzi Kick przy najbliższym redeployu (rotowany refresh token przestałby się zapisywać).
# Zejście z roota wymaga runbooka migracji wolumenu (chown w każdej instancji), nie jednej linii.
# Bez HEALTHCHECK też świadomie: proces jest outbound-only (zero portów do sondowania), a
# "bot żyje / nie żyje" raportuje już heartbeat.ts do portalu (panel admina online/offline);
# healthcheck w kontenerze wymagałby nowego mechanizmu (plik/endpoint), czyli nowej funkcji.
CMD ["npm", "start"]
