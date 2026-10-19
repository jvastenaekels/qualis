# syntax=docker/dockerfile:1.7
# MinIO's community images are no longer publicly pullable. Build the
# official source revisions instead of depending on an unofficial mirror.
FROM golang:1.26-alpine AS server-build
ENV CGO_ENABLED=0 GOBIN=/out
# RELEASE.2025-10-15T17-29-55Z (includes the session-policy security fix).
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go install -p 2 github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a \
    && cp "$(go list -m -f '{{.Dir}}' github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a)/LICENSE" /out/LICENSE

FROM golang:1.26-alpine AS client-build
ENV CGO_ENABLED=0 GOBIN=/out
# RELEASE.2025-08-13T08-35-41Z.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go install -p 2 github.com/minio/mc@7394ce0dd2a80935aded936b09fa12cbb3cb8096 \
    && cp "$(go list -m -f '{{.Dir}}' github.com/minio/mc@7394ce0dd2a80935aded936b09fa12cbb3cb8096)/LICENSE" /out/LICENSE

FROM alpine:3.23 AS client
RUN apk add --no-cache ca-certificates
COPY --from=client-build /out/mc /usr/local/bin/mc
COPY --from=client-build /out/LICENSE /usr/share/licenses/mc/LICENSE
ENTRYPOINT ["mc"]

FROM client AS server
COPY --from=server-build /out/minio /usr/local/bin/minio
COPY --from=server-build /out/LICENSE /usr/share/licenses/minio/LICENSE
VOLUME ["/data"]
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
