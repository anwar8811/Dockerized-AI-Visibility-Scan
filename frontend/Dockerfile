# syntax=docker/dockerfile:1

# ---- Stage 1: build ----
# NEXT_PUBLIC_API_URL must be present in the environment during `next build`
# itself - Next.js inlines every NEXT_PUBLIC_* variable into the client
# bundle at build time, it is frozen after that (never read at runtime).
FROM node:20-alpine AS build
WORKDIR /app/frontend

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# ---- Stage 2: runtime ----
# next.config.ts's output:"standalone" produces a minimal, self-contained
# server folder - only that + the static assets + public/ are needed here,
# same build-stage/slim-runtime split as backend/Dockerfile.api.
FROM node:20-alpine AS runtime
WORKDIR /app/frontend
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/frontend/public ./public

RUN mkdir .next && chown node:node .next

COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./.next/static

USER node

EXPOSE 3000
CMD ["node", "server.js"]
