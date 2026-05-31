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
COPY package.json package-lock.json* ./
RUN npm ci || npm install

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

CMD ["npm", "start"]
