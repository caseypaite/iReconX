# Installation

This guide sets up iReconX locally with **Node.js 20+** and **PostgreSQL**.

## Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL running locally or remotely

## 1. Clone and install

```bash
npm install
```

If you have not copied the repository yet, clone it first and run the command from the project root.

## 2. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Update the values in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ireconx?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
ENCRYPTION_SECRET="replace-with-a-second-long-random-secret"
OTP_MESSAGE_ENDPOINT="https://provider.example/api/v1/message/single"
OTP_MESSAGE_API_KEY="replace-with-provider-api-key"
SEED_ADMIN_EMAIL="admin@ireconx.local"
SEED_ADMIN_PASSWORD="ChangeMe123!"
SEED_ADMIN_MOBILE_NUMBER=""
```

### Variable notes

- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `JWT_SECRET`: required; used to sign and verify session cookies.
- `ENCRYPTION_SECRET`: strongly recommended; used to encrypt persisted data source configuration. If omitted, the app falls back to `JWT_SECRET`.
- `OTP_MESSAGE_ENDPOINT`: full URL of the external message provider endpoint compatible with `POST /api/v1/message/single`.
- `OTP_MESSAGE_API_KEY`: API key sent as `x-api-key` to the external message provider.
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: used by the seed script to create or update the initial admin account.
- `SEED_ADMIN_MOBILE_NUMBER`: optional mobile number. If you provide exactly 10 digits, the app assumes an Indian mobile number and prefixes `91`. Other values must already include a full 10-15 digit number.

## 3. Prepare the database

Generate the Prisma client:

```bash
npm run db:generate
```

Push the schema:

```bash
npm run db:push
```

Seed the initial admin user:

```bash
npm run db:seed
```

## 4. Start the app

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

### Docker Compose development

You can also run the app and PostgreSQL with Docker Compose:

```bash
docker compose up --build --watch
```

This setup:

- starts PostgreSQL in a sibling container
- runs the Next.js dev server on `http://localhost:3000`
- rebuilds the app image when code changes are detected, so the container image stays current during development

If your local `.env` still points `DATABASE_URL` at `localhost`, Compose overrides it for the app container so it connects to the `db` service automatically.

## 5. Sign in

Use the seeded admin credentials:

- Email: `SEED_ADMIN_EMAIL`
- Password: `SEED_ADMIN_PASSWORD`

If the account has a registered mobile number, the app sends a 6-digit OTP through the configured external provider before sign-in completes. After verification, admins are redirected to `/admin`; standard users are redirected to `/dashboard`.

## Common workflows

### Production build

```bash
npm run build
npm run start
```

### Type checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Updating schema during development

```bash
npm run db:migrate
```

Use `db:migrate` when you want a tracked Prisma migration in development. Use `db:push` for quicker local schema syncs.

## Troubleshooting

### Prisma cannot connect to PostgreSQL

- Confirm `DATABASE_URL` points to a reachable PostgreSQL instance.
- Verify the target database exists and the credentials have permission to connect.

### Login fails after seeding

- Re-run `npm run db:seed` after confirming `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.
- Make sure the app is using the same database configured in `DATABASE_URL`.

### Encrypted data source creation fails

- Ensure `ENCRYPTION_SECRET` or `JWT_SECRET` is set.
- Prefer a dedicated `ENCRYPTION_SECRET` instead of relying on the fallback.
