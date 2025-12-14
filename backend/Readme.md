# 🛠 Backend Setup Guide (Node + TypeScript)

This repository contains a **Node.js + TypeScript** backend project.  
Follow the steps below to run it locally with **PostgreSQL** + **Redis** using Docker.

---

## 📦 Backend Setup (Local)

### 1️⃣ Setup Environment Variables
Copy the sample `.env` file and configure:
```bash
cp .env.sample .env

# Update .env with your own values:
DATABASE_URL=postgres://testUser:mysecretpassword@localhost:5432/testDB
REDIS_URI=rediss://default:local@localhost:6379
```

2️⃣ Install Dependencies
```bash
npm install
```

3️⃣  🐳 Docker Setup (Postgres + Redis + UIs)
We use Docker Compose to run:

- PostgreSQL (database)

- Redis (cache)

- pgAdmin (UI for Postgres)

- RedisInsight (UI for Redis)

1️⃣ Start Containers
```bash
docker compose up -d
```
2️⃣ Verify Services
| Service      | URL / Host                                     | Notes                                                      |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------- |
| Postgres     | `localhost:5432`                               | User: `testUser` / Pass: `mysecretpassword` / DB: `testDB` |
| Redis        | `localhost:6379`                               | Password: `local`                                          |
| pgAdmin UI   | [http://localhost:5050](http://localhost:5050) | Login: `admin@admin.com` / `admin`                         |
| RedisInsight | [http://localhost:5540](http://localhost:5540) | Add Redis manually (see below)                             |


🛑 To Stop Containers
```bash
docker compose down
```


