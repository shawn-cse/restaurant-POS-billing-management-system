# Urban Bite API

The NestJS backend handles authentication, ordering, invoices, kitchen
operations, staff, inventory, reservations, reporting, and integrations.
PostgreSQL schema and migration SQL are in `prisma/`.

Start the complete deployment using `docker compose up -d --build` from the
workspace root. Its startup command applies Prisma migrations before serving.
The backend is internal to the Docker network; browsers connect through the
Next.js frontend (`/api/*`). Do not publish port 4000 directly by default.

See root `README.md` and `SECURITY.md` for deployment instructions.
