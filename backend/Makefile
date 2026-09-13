.PHONY: verify test race benchmark build

GO ?= go
BUILD_DIR ?= bin
VERSION ?= development
COMMIT ?= unknown
BUILD_TIME ?= unknown

verify:
	$(GO) mod verify
	$(GO) vet ./...
	$(GO) test -count=1 ./...

test:
	$(GO) test -count=1 ./...

race:
	$(GO) test -race -count=1 ./...

benchmark:
	$(GO) test -run '^$$' -bench . -benchmem ./internal/httpapi

build:
	mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 $(GO) build -trimpath -buildvcs=true -pgo=auto \
		-ldflags="-X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildTime=$(BUILD_TIME)" \
		-o $(BUILD_DIR)/wamercio-api ./cmd/api
