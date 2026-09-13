FROM golang:1.26-alpine AS build

ARG VERSION=development
ARG COMMIT=unknown
ARG BUILD_TIME=unknown
ARG TARGETARCH=amd64

WORKDIR /src
RUN apk add --no-cache ca-certificates git
COPY go.mod go.sum* ./
COPY third_party/waxum-go/go.mod ./third_party/waxum-go/go.mod
RUN go mod download && go mod verify
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build \
    -trimpath \
    -buildvcs=true \
    -pgo=auto \
    -ldflags="-X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
    -o /out/wamercio-api ./cmd/api

FROM alpine:3.22

WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S -g 10001 wamercio \
    && adduser -S -D -H -u 10001 -G wamercio wamercio
COPY --from=build --chown=10001:10001 /out/wamercio-api /app/wamercio-api
COPY --chown=10001:10001 db/core_migrations /app/db/core_migrations
COPY --chown=10001:10001 db/global_customer_migrations /app/db/global_customer_migrations
COPY --chown=10001:10001 db/tenant_migrations /app/db/tenant_migrations
COPY --chown=10001:10001 data /app/data
RUN test -s /app/data/catalog.json

USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=18 \
  CMD wget -qO- http://127.0.0.1:8080/health/ready >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/app/wamercio-api"]
