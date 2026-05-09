# LMS Platform — Makefile
# Usage: make <target>
# Run `make help` for a full list of targets.

.PHONY: help \
        infra-up infra-down infra-logs \
        install install-backend install-frontend install-transcoder \
        migrate \
        dev dev-backend dev-frontend dev-transcoder dev-notification \
        stop-backend stop-frontend stop-transcoder stop-notification stop-all \
        build build-backend build-frontend \
        logs-backend logs-frontend logs-transcoder logs-notification \
        status clean

# ── Colours ───────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
RESET := \033[0m
BOLD  := \033[1m

# ── PID files ─────────────────────────────────────────────────────────────────
PID_DIR   := .pids
PID_BE    := $(PID_DIR)/backend.pid
PID_FE    := $(PID_DIR)/frontend.pid
PID_TC    := $(PID_DIR)/transcoder.pid
PID_NS    := $(PID_DIR)/notification.pid

LOG_DIR   := .logs
LOG_BE    := $(LOG_DIR)/backend.log
LOG_FE    := $(LOG_DIR)/frontend.log
LOG_TC    := $(LOG_DIR)/transcoder.log
LOG_NS    := $(LOG_DIR)/notification.log

# ── Help ──────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "$(BOLD)LMS Platform — Available targets$(RESET)"
	@echo ""
	@echo "  $(CYAN)Infrastructure$(RESET)"
	@echo "    make infra-up          Start all Docker infrastructure services"
	@echo "    make infra-down        Stop all Docker infrastructure services"
	@echo "    make infra-logs        Tail Docker infrastructure logs"
	@echo ""
	@echo "  $(CYAN)Install$(RESET)"
	@echo "    make install           Install dependencies for all services"
	@echo "    make install-backend   npm install in backend/"
	@echo "    make install-frontend  npm install in frontend/"
	@echo "    make install-transcoder pnpm install in video-transcoder/"
	@echo ""
	@echo "  $(CYAN)Database$(RESET)"
	@echo "    make migrate           Run Prisma migrations for backend + transcoder"
	@echo ""
	@echo "  $(CYAN)Development (background)$(RESET)"
	@echo "    make dev               Start ALL services in background (infra + all apps)"
	@echo "    make dev-backend       Start backend only (background)"
	@echo "    make dev-frontend      Start frontend only (background)"
	@echo "    make dev-transcoder    Start video-transcoder only (background)"
	@echo "    make dev-notification  Start notification-service only (background)"
	@echo ""
	@echo "  $(CYAN)Stop$(RESET)"
	@echo "    make stop-all          Stop all background app services"
	@echo "    make stop-backend      Stop backend"
	@echo "    make stop-frontend     Stop frontend"
	@echo "    make stop-transcoder   Stop video-transcoder"
	@echo "    make stop-notification Stop notification-service"
	@echo ""
	@echo "  $(CYAN)Logs$(RESET)"
	@echo "    make logs-backend      Tail backend log"
	@echo "    make logs-frontend     Tail frontend log"
	@echo "    make logs-transcoder   Tail transcoder log"
	@echo "    make logs-notification Tail notification-service log"
	@echo ""
	@echo "  $(CYAN)Build$(RESET)"
	@echo "    make build             Build all services for production"
	@echo "    make build-backend     Build backend"
	@echo "    make build-frontend    Build frontend (Next.js)"
	@echo ""
	@echo "  $(CYAN)Misc$(RESET)"
	@echo "    make status            Show running app PIDs"
	@echo "    make clean             Stop all services and remove PID/log files"
	@echo ""

# ── Infrastructure ────────────────────────────────────────────────────────────
infra-up:
	@echo "$(CYAN)Starting infrastructure...$(RESET)"
	docker compose up -d
	@echo "$(CYAN)Waiting for services to be ready...$(RESET)"
	@sleep 5
	@echo "✓ PostgreSQL   → localhost:5432"
	@echo "✓ Redis        → localhost:6379"
	@echo "✓ Kafka        → localhost:9092"
	@echo "✓ MinIO        → localhost:9000  (console: 9001)"
	@echo "✓ MongoDB      → localhost:27017"
	@echo "✓ LocalStack   → localhost:4566"
	@echo "✓ Kafka UI     → http://localhost:8080"
	@echo "✓ Mongo UI     → http://localhost:8081"
	@echo "✓ pgAdmin      → http://localhost:5050"

infra-down:
	@echo "$(CYAN)Stopping infrastructure...$(RESET)"
	docker compose down

infra-logs:
	docker compose logs -f

# ── Install ───────────────────────────────────────────────────────────────────
install: install-backend install-frontend install-transcoder
	@echo "$(CYAN)✓ All dependencies installed$(RESET)"

install-backend:
	@echo "$(CYAN)Installing backend dependencies...$(RESET)"
	cd backend && npm install

install-frontend:
	@echo "$(CYAN)Installing frontend dependencies...$(RESET)"
	cd frontend && npm install

install-transcoder:
	@echo "$(CYAN)Installing video-transcoder dependencies...$(RESET)"
	cd video-transcoder && pnpm install

# ── Migrations ────────────────────────────────────────────────────────────────
migrate:
	@echo "$(CYAN)Running Prisma migrations...$(RESET)"
	cd backend && npx prisma migrate deploy
	@echo "$(CYAN)Generating Prisma clients...$(RESET)"
	cd backend && npx prisma generate
	cd video-transcoder && pnpm run prisma:generate
	@echo "$(CYAN)✓ Migrations complete$(RESET)"

# ── Dev (background) ─────────────────────────────────────────────────────────
_ensure-dirs:
	@mkdir -p $(PID_DIR) $(LOG_DIR)

dev-backend: _ensure-dirs
	@if [ -f $(PID_BE) ] && kill -0 $$(cat $(PID_BE)) 2>/dev/null; then \
		echo "Backend already running (PID $$(cat $(PID_BE)))"; \
	else \
		echo "$(CYAN)Starting backend on :5001...$(RESET)"; \
		cd backend && npm run dev > ../$(LOG_BE) 2>&1 & echo $$! > ../$(PID_BE); \
		echo "✓ Backend started (PID $$(cat $(PID_BE))) — logs: $(LOG_BE)"; \
	fi

dev-frontend: _ensure-dirs
	@if [ -f $(PID_FE) ] && kill -0 $$(cat $(PID_FE)) 2>/dev/null; then \
		echo "Frontend already running (PID $$(cat $(PID_FE)))"; \
	else \
		echo "$(CYAN)Starting frontend on :3000...$(RESET)"; \
		cd frontend && npm run dev > ../$(LOG_FE) 2>&1 & echo $$! > ../$(PID_FE); \
		echo "✓ Frontend started (PID $$(cat $(PID_FE))) — logs: $(LOG_FE)"; \
	fi

dev-transcoder: _ensure-dirs
	@if [ -f $(PID_TC) ] && kill -0 $$(cat $(PID_TC)) 2>/dev/null; then \
		echo "Video transcoder already running (PID $$(cat $(PID_TC)))"; \
	else \
		echo "$(CYAN)Starting video-transcoder on :7000...$(RESET)"; \
		cd video-transcoder && pnpm run dev > ../$(LOG_TC) 2>&1 & echo $$! > ../$(PID_TC); \
		echo "✓ Transcoder started (PID $$(cat $(PID_TC))) — logs: $(LOG_TC)"; \
	fi

dev-notification: _ensure-dirs
	@if [ -f $(PID_NS) ] && kill -0 $$(cat $(PID_NS)) 2>/dev/null; then \
		echo "Notification service already running (PID $$(cat $(PID_NS)))"; \
	else \
		echo "$(CYAN)Starting notification-service on :8085...$(RESET)"; \
		cd notification-service && ./mvnw spring-boot:run > ../$(LOG_NS) 2>&1 & echo $$! > ../$(PID_NS); \
		echo "✓ Notification service started (PID $$(cat $(PID_NS))) — logs: $(LOG_NS)"; \
	fi

dev: infra-up dev-backend dev-frontend dev-transcoder dev-notification
	@echo ""
	@echo "$(BOLD)All services started:$(RESET)"
	@echo "  Frontend       → http://localhost:3000"
	@echo "  Backend API    → http://localhost:5001"
	@echo "  Transcoder     → http://localhost:7000"
	@echo "  Notifications  → http://localhost:8085"
	@echo ""
	@echo "  Kafka UI       → http://localhost:8080"
	@echo "  Mongo UI       → http://localhost:8081"
	@echo "  pgAdmin        → http://localhost:5050"
	@echo "  MinIO Console  → http://localhost:9001"
	@echo ""
	@echo "Run $(CYAN)make logs-backend$(RESET) etc. to tail logs."
	@echo "Run $(CYAN)make stop-all$(RESET) to stop everything."

# ── Stop ──────────────────────────────────────────────────────────────────────
stop-backend:
	@if [ -f $(PID_BE) ]; then \
		PID=$$(cat $(PID_BE)); \
		if kill -0 $$PID 2>/dev/null; then kill $$PID && echo "✓ Backend stopped"; \
		else echo "Backend not running"; fi; \
		rm -f $(PID_BE); \
	else echo "Backend not running"; fi

stop-frontend:
	@if [ -f $(PID_FE) ]; then \
		PID=$$(cat $(PID_FE)); \
		if kill -0 $$PID 2>/dev/null; then kill $$PID && echo "✓ Frontend stopped"; \
		else echo "Frontend not running"; fi; \
		rm -f $(PID_FE); \
	else echo "Frontend not running"; fi

stop-transcoder:
	@if [ -f $(PID_TC) ]; then \
		PID=$$(cat $(PID_TC)); \
		if kill -0 $$PID 2>/dev/null; then kill $$PID && echo "✓ Transcoder stopped"; \
		else echo "Transcoder not running"; fi; \
		rm -f $(PID_TC); \
	else echo "Transcoder not running"; fi

stop-notification:
	@if [ -f $(PID_NS) ]; then \
		PID=$$(cat $(PID_NS)); \
		if kill -0 $$PID 2>/dev/null; then kill $$PID && echo "✓ Notification service stopped"; \
		else echo "Notification service not running"; fi; \
		rm -f $(PID_NS); \
	else echo "Notification service not running"; fi

stop-all: stop-backend stop-frontend stop-transcoder stop-notification
	@echo "$(CYAN)✓ All app services stopped$(RESET)"
	@echo "Run $(CYAN)make infra-down$(RESET) to also stop Docker infrastructure."

# ── Logs ──────────────────────────────────────────────────────────────────────
logs-backend:
	@tail -f $(LOG_BE) 2>/dev/null || echo "No backend log found. Run: make dev-backend"

logs-frontend:
	@tail -f $(LOG_FE) 2>/dev/null || echo "No frontend log found. Run: make dev-frontend"

logs-transcoder:
	@tail -f $(LOG_TC) 2>/dev/null || echo "No transcoder log found. Run: make dev-transcoder"

logs-notification:
	@tail -f $(LOG_NS) 2>/dev/null || echo "No notification log found. Run: make dev-notification"

# ── Build ─────────────────────────────────────────────────────────────────────
build-backend:
	@echo "$(CYAN)Building backend...$(RESET)"
	cd backend && npm run build

build-frontend:
	@echo "$(CYAN)Building frontend...$(RESET)"
	cd frontend && npm run build

build: build-backend build-frontend
	@echo "$(CYAN)Building notification-service...$(RESET)"
	cd notification-service && ./mvnw clean package -DskipTests
	@echo "$(CYAN)✓ All services built$(RESET)"

# ── Status ────────────────────────────────────────────────────────────────────
status:
	@echo ""
	@echo "$(BOLD)Service status:$(RESET)"
	@printf "  %-22s" "Backend (:5001)"; \
		if [ -f $(PID_BE) ] && kill -0 $$(cat $(PID_BE)) 2>/dev/null; \
		then echo "$(CYAN)running$(RESET) (PID $$(cat $(PID_BE)))"; \
		else echo "stopped"; fi
	@printf "  %-22s" "Frontend (:3000)"; \
		if [ -f $(PID_FE) ] && kill -0 $$(cat $(PID_FE)) 2>/dev/null; \
		then echo "$(CYAN)running$(RESET) (PID $$(cat $(PID_FE)))"; \
		else echo "stopped"; fi
	@printf "  %-22s" "Transcoder (:7000)"; \
		if [ -f $(PID_TC) ] && kill -0 $$(cat $(PID_TC)) 2>/dev/null; \
		then echo "$(CYAN)running$(RESET) (PID $$(cat $(PID_TC)))"; \
		else echo "stopped"; fi
	@printf "  %-22s" "Notification (:8085)"; \
		if [ -f $(PID_NS) ] && kill -0 $$(cat $(PID_NS)) 2>/dev/null; \
		then echo "$(CYAN)running$(RESET) (PID $$(cat $(PID_NS)))"; \
		else echo "stopped"; fi
	@echo ""
	@echo "$(BOLD)Docker infrastructure:$(RESET)"
	@docker compose ps --format "  {{.Name}}\t{{.Status}}" 2>/dev/null || echo "  (docker compose not running)"
	@echo ""

# ── Clean ─────────────────────────────────────────────────────────────────────
clean: stop-all
	@rm -rf $(PID_DIR) $(LOG_DIR)
	@echo "$(CYAN)✓ PID and log files removed$(RESET)"
