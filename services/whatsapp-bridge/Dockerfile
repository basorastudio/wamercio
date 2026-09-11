FROM golang:1.23-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/wamercio-whatsapp ./cmd/bridge

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata wget
WORKDIR /app
COPY --from=builder /out/wamercio-whatsapp /app/wamercio-whatsapp
EXPOSE 8090
CMD ["/app/wamercio-whatsapp"]
