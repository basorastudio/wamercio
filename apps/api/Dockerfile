FROM golang:1.27.1-alpine AS build
WORKDIR /src

# go.sum is intentionally allowed to be absent from a fresh source export.
# Download the versions pinned in go.mod first for layer caching.
COPY go.mod ./
RUN go mod download

# After the complete source is present, let Go resolve the exact import graph,
# generate/complete go.sum inside the build stage and then compile in mod mode.
# This avoids Dokploy builds failing with "missing go.sum entry" when the
# repository was exported before go.sum could be generated.
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -mod=mod -trimpath -ldflags="-s -w" -o /out/wamercio-api ./cmd/api

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /out/wamercio-api /app/wamercio-api
RUN mkdir -p /data/uploads
EXPOSE 8080
ENTRYPOINT ["/app/wamercio-api"]
