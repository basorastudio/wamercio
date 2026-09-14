FROM golang:1.27.1-alpine AS build
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY go.mod ./
COPY . .
RUN go mod tidy && go mod verify
RUN CGO_ENABLED=0 GOOS=linux go build -mod=readonly -trimpath -ldflags="-s -w" -o /out/domain-router ./cmd/router

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/domain-router /usr/local/bin/domain-router
ENTRYPOINT ["domain-router"]
