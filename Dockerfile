# Docker's official Node image from AWS's public mirror: the same image, without
# Docker Hub's anonymous pull limit, which failed the main image build on shared
# GitHub runners (toomanyrequests / auth timeouts).
FROM public.ecr.aws/docker/library/node:26.11.1-alpine AS base

# ── deps stage: install all dependencies ──────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── builder stage: build the Next.js app ──────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build args are baked into the image at build time for NEXT_PUBLIC_ vars
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_FRONTEND_SHA
# The host ambassador referral links are shown under. Per environment (it must
# match that environment's Dub domain) and required: next.config.ts refuses the
# build without it.
ARG NEXT_PUBLIC_AMBASSADOR_LINK_HOST
# Build identity, supplied by the pipeline (scripts/print-app-version.mjs) and
# inlined into the bundle. The container is told what it is; it never works it
# out, so no git and no repository are needed at runtime.
ARG NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_BUILD_ID
ARG NEXT_PUBLIC_BUILT_AT
ARG NEXT_PUBLIC_USE_API_PROXY=false
# next.config.ts and robots.ts both call Boolean(process.env.STAGING_GATE_PASSWORD)
# at build time to decide whether to emit noindex. Without these declarations
# docker silently drops the matching --build-arg, and the image is built in
# allow-mode however the deploy is invoked -- which is exactly what happened on
# the first TEST deployment of the gate.
#
# Only the presence of a password matters at build time; the real comparison
# happens at runtime in the middleware and /access/submit. The deploy therefore
# passes a placeholder here and injects the real secret as runtime environment,
# which keeps it out of image history.
ARG APP_ENV=DEV
ARG STAGING_GATE_PASSWORD=
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_FRONTEND_SHA=$NEXT_PUBLIC_FRONTEND_SHA
ENV NEXT_PUBLIC_AMBASSADOR_LINK_HOST=$NEXT_PUBLIC_AMBASSADOR_LINK_HOST
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_BUILT_AT=$NEXT_PUBLIC_BUILT_AT
ENV NEXT_PUBLIC_USE_API_PROXY=$NEXT_PUBLIC_USE_API_PROXY
ENV APP_ENV=$APP_ENV
ENV STAGING_GATE_PASSWORD=$STAGING_GATE_PASSWORD
RUN npm run build && npm run check:dynamic-api-routes

# ── runner stage: minimal production image ────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy standalone output and static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
