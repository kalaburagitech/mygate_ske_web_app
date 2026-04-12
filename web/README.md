# KLB Security Web

This is the **web** application built with **Next.js (App Router)**. The UI is a **client-only SPA** mounted by Next and routed via `react-router-dom`, while server endpoints live under `app/api/**`.

## Requirements
- **Node.js**: 20 LTS (see `package.json` `engines` and `.nvmrc` if present)

## Environment variables
Create a `web/.env.local` with at least:
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY` (server-only)

## Local development
From the `web/` directory:

```bash
npm ci
npm run dev
```

## Production build

```bash
npm run build
npm run start
```

