FROM golang:1.27.1-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/wamercio-api ./cmd/api

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /out/wamercio-api /app/wamercio-api
RUN mkdir -p /data/uploads
EXPOSE 8080
ENTRYPOINT ["/app/wamercio-api"]
