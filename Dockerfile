# Production image: docker build -t bug-tracker-api . && docker run --env-file .env -p 3001:3001 bug-tracker-api
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/api/health" || exit 1

CMD ["node", "src/server.js"]
