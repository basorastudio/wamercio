.PHONY: up down logs api-test web-build
up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

api-test:
	cd apps/api && go test ./...

web-build:
	cd apps/web && npm run build
