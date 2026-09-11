FROM golang:1.27.1-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY go.mod ./
COPY . .
RUN go mod tidy && go mod verify
RUN CGO_ENABLED=0 GOOS=linux go build -mod=readonly -trimpath -ldflags="-s -w" -o /out/wamercio-api ./cmd/api

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata wget
WORKDIR /app
COPY --from=builder /out/wamercio-api /app/wamercio-api
COPY migrations /app/migrations
RUN mkdir -p /app/data/uploads
EXPOSE 8080
CMD ["/app/wamercio-api"]
