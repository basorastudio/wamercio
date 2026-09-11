.PHONY: up down logs restart build
up:
	docker compose up -d --build
down:
	docker compose down
logs:
	docker compose logs -f --tail=200
restart:
	docker compose restart
build:
	docker compose build --no-cache
