# UrbanBite Restaurant — POS & Billing Management System

## Short Description
UrbanBite Restaurant is a modern Point-of-Sale (POS) and billing management system tailored for fast-paced restaurant operations. It seamlessly coordinates table service, live kitchen order tickets, multi-method payments, and sales reporting across staff roles.

## Technology Stack
- **Frontend:** Next.js 15, React 19, Tailwind CSS, Lucide Icons
- **Backend:** NestJS 11, Node.js 22, Express
- **Database & ORM:** PostgreSQL 16, Prisma ORM
- **Containerization & Tooling:** Docker, Docker Compose, Turborepo, TypeScript

---

## Without Docker — Windows

### A. First-Time Setup

1. **Required Software**
   - Node.js 22 or higher
   - pnpm (`corepack enable` followed by `corepack prepare pnpm@latest --activate`)
   - PostgreSQL 16 running on `localhost:5432` with a database named `nodedr_restaurant`

2. **Install Dependencies**
   ```powershell
   pnpm install
   pnpm --filter @nodedr-restaurant/types build
   ```

3. **Configure Environment**
   ```powershell
   Copy-Item .env.example .env
   Copy-Item apps\backend\.env.example apps\backend\.env
   ```

4. **Set Up Database and Load Demo Data**
   ```powershell
   pnpm --filter @nodedr-restaurant/backend exec prisma generate
   pnpm --filter @nodedr-restaurant/backend exec prisma migrate deploy
   pnpm --filter @nodedr-restaurant/backend run prisma:seed
   ```

5. **Start the Application**
   ```powershell
   pnpm dev
   ```

6. **Open the Browser URL**
   - Application URL: [http://localhost:8080](http://localhost:8080)

---

### B. Start Again
To run the already installed project:
```powershell
pnpm dev
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

---

### C. Stop
Press `Ctrl + C` in the running PowerShell terminal and type `Y` to confirm exit.

---

## With Docker — Windows

### A. First-Time Setup

1. **Install and Start Docker Desktop**
   Ensure Docker Desktop for Windows is installed, running, and using Linux containers.

2. **Configure Environment**
   ```powershell
   Copy-Item .env.example .env
   ```

3. **Build and Start Containers**
   ```powershell
   docker compose up -d --build
   ```

4. **Initialize Database and Load Demo Data**
   Run the database seed command to populate demo menu categories, 33 food items with photos, tables, and staff accounts:
   ```powershell
   docker exec -it restaurant-pos-backend npx ts-node prisma/seed.ts
   ```

5. **Open the Browser URL**
   - Application URL: [http://localhost:8080](http://localhost:8080)

---

### B. Start Again
To start existing containers without rebuilding:
```powershell
docker compose up -d
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

---

### C. Stop
To stop running containers safely without losing database data:
```powershell
docker compose down
```

---

## Demo Accounts

Password for all accounts: **`abc123`**

| Role | Username | Email | Portal |
|---|---|---|---|
| **Super Admin** | `admin` | `admin@gmail.com` | `/dashboard` |
| **Manager** | `manager` | `manager@gmail.com` | `/dashboard` |
| **Cashier** | `cashier` | `cashier@gmail.com` | `/pos` |
| **Waiter** | `waiter` | `waiter@gmail.com` | `/pos` |
| **Kitchen Staff** | `kitchen` | `kitchen@gmail.com` | `/kds` |
