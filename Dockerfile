# ---- build ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY vendor ./vendor
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
ARG VITE_STRIPE_PUBLIC_KEY
ENV VITE_STRIPE_PUBLIC_KEY=$VITE_STRIPE_PUBLIC_KEY
ENV NODE_OPTIONS=--max-old-space-size=3584
RUN npm run build

# ---- runtime ----
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY vendor ./vendor
# Runtime needs node_modules: the server bundle is built with
# --packages=external, so dependencies are imported at runtime.
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY drizzle.config.ts ./
COPY shared ./shared
# ai-tools-seed.ts reads its CSV from ../attached_assets at boot
COPY attached_assets ./attached_assets
EXPOSE 8080
CMD ["node", "dist/index.js"]
