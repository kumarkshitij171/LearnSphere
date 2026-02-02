1️⃣ Open pgAdmin in your browser

From your docker-compose:

http://localhost:5050


Login:

Email: admin@admin.com

Password: admin

2️⃣ Register the Postgres server in pgAdmin

pgAdmin does not auto-connect — you must add the server once.

Right-click:
Servers → Register → Server…

3️⃣ Connection settings (IMPORTANT)
🟣 General tab

Name: Local Postgres (anything you like)

🟣 Connection tab

Use Docker service name, not localhost:

| Field                 | Value              |
| --------------------- | ------------------ |
| **Host name/address** | `postgres`         |
| **Port**              | `5432`             |
| **Maintenance DB**    | `testDB`           |
| **Username**          | `testUser`         |
| **Password**          | `mysecretpassword` |
| **Save password**     | ✅                 |

Click Save