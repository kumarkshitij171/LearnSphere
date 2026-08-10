# LearnSphere LMS — dev orchestration
#
# Start everything:        make start
# Start chosen services:   make start SERVICES="backend frontend"
# Single service:          make backend   (or frontend / transcoder / infra / notification)
# Infra control:           make stop | restart | logs | ps
#
# Available services: infra localstack backend frontend transcoder notification

SERVICES ?= infra backend frontend transcoder

.DEFAULT_GOAL := help

.PHONY: help start stop restart logs ps \
        infra localstack backend frontend transcoder notification

help:
	@echo "LearnSphere dev commands:"
	@echo "  make start                                 start infra + backend + frontend + transcoder"
	@echo "  make start SERVICES=\"backend frontend\"      start only the listed services"
	@echo "  make infra | localstack | backend | frontend | transcoder | notification"
	@echo "  make stop | restart | logs | ps"
	@echo ""
	@echo "  Services: infra localstack backend frontend transcoder notification"

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
	cd video-transcoder && pnpm dev

notification:
	cd notification-service && ./mvnw spring-boot:run

stop:
	docker compose down

restart: stop infra

logs:
	docker compose logs -f

ps:
	docker compose ps
