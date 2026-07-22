# Build stage
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Safe standalone default. Production Compose overrides this with the public
# hostname; keeping localhost here preserves the zero-config demo path.
ENV QUALIS_ALLOWED_HOST_PATTERN="^(qualis[.]example[.]org|localhost|127[.]0[.]0[.]1)$"

# F-02-006 (frontend) — the upstream nginx:alpine image already drops to
# the unprivileged `nginx` user (UID 101) for worker processes; the
# master starts as root only to bind :80, which is the documented nginx
# pattern. No explicit USER directive needed; documenting the audit
# decision here so a future contributor doesn't add one and break
# port-binding.

COPY --from=build /app/dist /usr/share/nginx/html
# The official nginx entrypoint renders templates with container environment
# variables before nginx starts, making the Host allowlist deploy-specific.
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80
