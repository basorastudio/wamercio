.PHONY: test vet fmt generate check

fmt:
	gofmt -w .

generate:
	go generate ./...

test:
	go test ./...

vet:
	go vet ./...

check: fmt test vet
