# LearnSphere LMS — dev orchestration
#
# Start everything:        make start
# Start chosen services:   make start SERVICES="backend frontend"
# Single service:          make backend   (or frontend / transcoder / infra / notification / order)
# Infra control:           make stop | restart | logs | ps
# Dependencies:            make install   (every service)    ·   make test   (every suite)
#
# Available services: infra localstack backend frontend transcoder notification order

SERVICES ?= infra backend frontend transcoder order notification

.DEFAULT_GOAL := help

.PHONY: help install test start stop restart logs ps \
        infra localstack backend frontend transcoder notification order

help:
	@echo "LearnSphere dev commands:"
	@echo "  make start                                 start infra + every service"
	@echo "  make start SERVICES=\"backend frontend\"      start only the listed services"
	@echo "  make infra | localstack | backend | frontend | transcoder | notification | order"
	@echo "  make stop | restart | logs | ps"
	@echo "  make install                              install dependencies for every service"
	@echo "  make test                                 run every service's test suite"
	@echo ""
	@echo "  Services: infra localstack backend frontend transcoder notification order"

# Each service with its own package manager. Maven skips tests here: order-service's suite
# needs Docker (Testcontainers) — run `make test` for that.
install:
	@echo "==> backend (npm)" && cd backend && npm install && npx prisma generate
	@echo "==> frontend (npm)" && cd frontend && npm install
	@echo "==> video-transcoder" && cd video-transcoder && npm install
	@echo "==> order-service (maven)" && cd order-service && ./mvnw -B clean install -DskipTests
	@echo "==> notification-service (maven)" && cd notification-service && ./mvnw -B clean install -DskipTests
	@echo "All dependencies installed."

test:
	@echo "==> backend" && cd backend && npm test
	@echo "==> video-transcoder" && cd video-transcoder && npm test
	@echo "==> order-service" && cd order-service && ./mvnw -B test
	@echo "==> notification-service" && cd notification-service && ./mvnw -B test

# Start infrastructure first, then run the selected application services together
# under one process group; Ctrl-C stops all.
start:
	@echo "Starting: $(SERVICES)"
	@if echo " $(SERVICES) " | grep -q " infra "; then \
		$(MAKE) --no-print-directory infra; \
	fi
	@trap 'kill 0' INT TERM; \
	for svc in $(SERVICES); do \
		[ "$$svc" = "infra" ] && continue; \
		$(MAKE) --no-print-directory $$svc & \
	done; \
	wait

# Local infra via docker compose (postgres, redis, kafka, localstack, mongo, UIs).
infra:
	docker compose up -d --wait

# Standalone LocalStack (s3 + sqs + sns) using the dedicated compose file.
localstack:
	docker compose -f localstack-file.yml up -d

backend:
	cd backend && npm run dev

frontend:
	cd frontend && npm run dev

transcoder:
	cd video-transcoder && npm run dev

notification:
	cd notification-service && ./mvnw spring-boot:run

order:
	cd order-service && ./mvnw spring-boot:run

stop:
	docker compose down

restart: stop infra

logs:
	docker compose logs -f

ps:
	docker compose ps
