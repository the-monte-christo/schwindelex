# Schwindelex – ein Node-Prozess liefert Client und WebSocket aus.
# Gebaut wird auf dem vServer aus dem Git-Checkout (siehe deploy/deploy.sh).

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./server/src
COPY shared ./shared
COPY data ./data
COPY --from=build /app/client/dist ./client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz > /dev/null || exit 1
# TypeScript läuft direkt per Type-Stripping von Node 24
CMD ["node", "server/src/main.ts"]
