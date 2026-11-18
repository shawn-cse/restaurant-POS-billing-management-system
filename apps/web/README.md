# Urban Bite web interface

This Next.js 16 web application is the staff dashboard, kitchen display,
customer kiosk and QR ordering interface for Urban Bite.

Run the **whole stack** from the root `Urban Bite` directory using:

```sh
docker compose up -d --build
```

See the root `README.md` for setup, login, secrets, networking, and printing.
For local non-Docker development (with PostgreSQL running and the backend API
available on port 4001), first install Node.js 22 and pnpm 11, run
`pnpm install` from the workspace root, then run `pnpm --filter @urbanbite/web dev`.
The browser proxies API routes via `apps/web/next.config.ts`.
