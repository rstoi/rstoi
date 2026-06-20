# Gateway do setupOS Cloud — WebSocket pty + verificação de token.
FROM node:22-slim

# node-pty precisa de toolchain para compilar bindings nativos.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
