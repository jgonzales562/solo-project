# Contributing

## Prerequisites
- Node.js 18+ (repo `.nvmrc` targets 20.x). If you use `nvm`, run `nvm use`.
- npm 9+ recommended.

## Setup
```bash
npm install
```

## Scripts
- `npm run dev` — run server + browser-sync client proxy
- `npm test` — lint + build + integration tests
- `npm run lint` — ESLint (TypeScript + client JS)
- `npm run build` — TypeScript build

## Notes
- CSRF cookies default to `secure` in production; override with `CSRF_SECURE_COOKIE=false` only for local HTTP.
- Health checks: `/health` (liveness), `/ready` (readiness).
- Docker builds exclude dev files via `.dockerignore`; use `docker-compose up --build` to rebuild. 
