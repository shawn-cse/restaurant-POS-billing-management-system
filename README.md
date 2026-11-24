# Urban Bite — Restaurant POS & Management System

Urban Bite is a self-hosted, web-based restaurant point-of-sale (POS) and management platform for dine-in orders, table management, KDS, inventory, staff, and takeaway.

---

## Demo Credentials

| Role | Username | Email | Password | Access |
| :--- | :--- | :--- | :--- | :--- |
| **Owner / Admin** | `admin` | `admin@gmail.com` | `abc123` | Full dashboard access |
| **Clean Setup** | *(Your username)* | *(Your email)* | *(Your password)* | Create via initial setup wizard |

> Sign in using either your **Username** (`admin`) or **Email** (`admin@gmail.com`) with Password (`abc123`).

---

## Docker Setup & Operations

Containers run under project group **`urbanbite_restaurant`**:
- **Frontend Web UI:** `UrbanBite_Restaurant_Web` → [http://localhost:9000](http://localhost:9000)
- **Backend API:** `UrbanBite_Restaurant_Backend` → Port `4000`
- **Database:** `UrbanBite_Restaurant_Postgres` → Port `5432`

---

### 1. Fast Setup (First Time)

**Step 1: Create `.env` file**
```powershell
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

**Step 2: Build and start containers**
```bash
docker compose up -d --build
```

**Step 3: (Optional) Seed demo data**
```bash
docker compose exec backend npm run prisma:seed
```

👉 Open **[http://localhost:9000](http://localhost:9000)** *(or double-click `START-URBAN-BITE.bat` on Windows)*.

---

### 2. Daily Workflow (Run, Stop & Maintain)

**Start / Re-run the project:**
```bash
docker compose up -d
```

**Stop / Close the project** *(safe — preserves database & uploads)*:
```bash
docker compose down
```

**Rebuild after code edits:**
```bash
docker compose up -d --build
```

**Check status & view logs:**
```bash
# Check container status
docker compose ps

# View live backend & frontend logs
docker compose logs -f backend web

# Restart all services
docker compose restart
```

---

### 3. Clean Setup / Full Reset (Wipe All Data)

Wipes all database records, orders, tables, and uploaded images to start completely fresh:

**Step 1: Stop containers and delete all volumes**
```bash
docker compose down -v
```

**Step 2: Start fresh containers**
```bash
docker compose up -d --build
```

**Step 3: Choose setup path**
- **Fresh Store:** Open **[http://localhost:9000](http://localhost:9000)** and complete the setup wizard.
- **Demo Store:** Run demo seed:
  ```bash
  docker compose exec backend npm run prisma:seed
  ```

---

## Local Network Access (Wi-Fi)

To access POS from waiter tablets or phones on your restaurant's Wi-Fi:

1. In `.env`, set your PC's local IP address:
   ```ini
   FRONTEND_ORIGIN=http://192.168.1.50:9000
   ```
2. Restart containers:
   ```bash
   docker compose up -d
   ```
3. Open `http://<HOST_IP>:9000` on any device connected to the same Wi-Fi.
