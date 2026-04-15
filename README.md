# iReconX

iReconX is a secure analytics studio built with **Next.js 14 App Router**, **Prisma**, and **PostgreSQL**. It ships with cookie-based JWT authentication, admin/user role separation, encrypted data source credentials, and audited access to the protected analytics workspace.

## Documentation

- [Installation guide](./INSTALLATION.md)
- [Security guide](./SECURITY.md)

## Highlights

- **Protected analytics workspace** for query-building, metadata inspection, tabular previews, and visualization placeholders.
- **Admin control plane** for user management, data source registration, audit review, and usage monitoring.
- **Role-based access control** with `ADMIN` and `USER` roles enforced in middleware and server-side API helpers.
- **Conditional login OTP** for users with a registered mobile number, delivered through an external WhatsApp-compatible message endpoint.
- **Encrypted data source configuration** persisted with AES-256-GCM before being stored in the database.
- **Audit logging** for authentication activity, user lifecycle changes, data source creation, and query execution events.

## Stack

| Area | Technology |
| --- | --- |
| Web app | Next.js 14, React 18, TypeScript |
| Styling | Tailwind CSS |
| Data access | Prisma ORM |
| Database | PostgreSQL |
| Auth | JWT via `jose`, HTTP-only cookies |
| Validation | Zod |

## Application areas

- `app/(auth)` - login experience and public entry flow.
- `app/(protected)/dashboard` - authenticated analyst workspace.
- `app/(protected)/admin` - admin-only overview and governance pages.
- `app/api/auth` - login, logout, and current-user session endpoints.
- `app/api/admin` - admin-only user, data source, audit, and resource APIs.
- `app/api/explorer` - authenticated explorer execution endpoints.
- `lib/auth` - token signing, cookie helpers, and route/session enforcement.
- `lib/security` - encryption helpers for sensitive connection payloads.
- `prisma/schema.prisma` - persistence model for users, data sources, and audit logs.

## Core behavior

### Authentication

- Login requests are validated with Zod and authenticated against Prisma-backed users.
- Users with a registered mobile number must complete a second-factor OTP check before a session cookie is issued.
- Sessions are signed as JWTs and stored in the `ireconx_session` HTTP-only cookie.
- `/login` redirects authenticated users to `/admin` or `/dashboard` based on role.
- `/api/auth/me` resolves the active session for authenticated clients.

### Authorization

- Middleware protects `/dashboard`, `/admin`, `/api/admin/*`, `/api/explorer/*`, and `/api/auth/me`.
- Admin-only routes reject non-admin access with redirects or `403` JSON responses.
- API handlers also re-check the session server-side, so authorization does not rely on middleware alone.

### Session invalidation

- Each user record carries a `sessionVersion`.
- Password, role, or active-state changes increment `sessionVersion`, invalidating older tokens.
- Inactive accounts are blocked even if a cookie is still present.

### Governance and auditing

- Admins can create, update, deactivate, and delete users.
- Admins can register per-user mobile numbers to enable login OTP delivery.
- Admins can register governed data sources without exposing raw configuration values in database rows.
- Audit records capture login, logout, user management, data source creation, and query execution events.

## Quick start

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Generate the Prisma client with `npm run db:generate`.
4. Push the schema with `npm run db:push`.
5. Seed the first admin with `npm run db:seed`.
6. Start the app with `npm run dev`.
7. Open `http://localhost:3000` and sign in with the seeded admin account.

For a containerized dev workflow, run `docker compose up --build --watch` to start the app and Postgres on `http://localhost:7080`, publish it on all host interfaces, and rebuild the app image whenever code changes are detected.

See [INSTALLATION.md](./INSTALLATION.md) for the full setup flow and environment details.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string for Prisma |
| `JWT_SECRET` | Yes | Secret used to sign and verify session JWTs |
| `ENCRYPTION_SECRET` | Recommended | Secret used to encrypt stored data source configuration |
| `OTP_MESSAGE_ENDPOINT` | For OTP delivery | Full URL for the external `POST /api/v1/message/single` endpoint |
| `OTP_MESSAGE_API_KEY` | For OTP delivery | API key sent in the `x-api-key` header to the external provider |
| `SEED_ADMIN_EMAIL` | For seeding | Email for the initial admin account |
| `SEED_ADMIN_PASSWORD` | For seeding | Password for the initial admin account |
| `SEED_ADMIN_MOBILE_NUMBER` | Optional | Seed-time mobile number; 10-digit inputs are treated as Indian and prefixed with `91` |

## Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Build the production app |
| `npm run start` | Run the built production server |
| `npm run lint` | Run Next.js linting |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:push` | Push the Prisma schema to the database |
| `npm run db:migrate` | Create and apply a development migration |
| `npm run db:seed` | Seed the initial admin user |

## Current limitations

- Explorer query execution currently returns an accepted placeholder preview rather than connecting to a live warehouse.
- Visualization and grid components are scaffolded for extension, not yet wired to a production analytics backend.
