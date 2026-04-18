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
OTP_SECRET=""
SITE_NAME="iReconX Analytics Studio"
SITE_URL="https://ireconx.sigstack.com"
AI_COPILOT_ENDPOINT="https://models.github.ai/inference/chat/completions"
AI_COPILOT_MODEL="openai/gpt-4.1"
AI_COPILOT_API_KEY=""
AI_GEMINI_ENDPOINT="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
AI_GEMINI_MODEL="gemini-2.5-flash"
AI_GEMINI_API_KEY=""
AI_MISTRAL_ENDPOINT="https://api.mistral.ai/v1/chat/completions"
AI_MISTRAL_MODEL="mistral-large-latest"
AI_MISTRAL_API_KEY=""
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
- `OTP_SECRET`: optional secret for OTP challenge signing. If omitted, the app falls back to `JWT_SECRET`.
- `SITE_NAME`: optional brand name displayed in auth screens, shell chrome, metadata, and OTP messages.
- `SITE_URL`: canonical public origin for the app. Set this to your domain, such as `https://ireconx.sigstack.com`, when exposing the site outside localhost.
- `AI_COPILOT_*`, `AI_GEMINI_*`, and `AI_MISTRAL_*`: optional AI provider credentials, endpoints, and model IDs used by the Data Studio plugin generator.
- `OTP_MESSAGE_ENDPOINT`: full URL of the external message provider endpoint compatible with `POST /api/v1/message/single`.
- `OTP_MESSAGE_API_KEY`: API key sent as `x-api-key` to the external message provider.
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: used by the seed script to create the initial admin account when the database does not already contain an admin.
- `SEED_ADMIN_MOBILE_NUMBER`: optional mobile number. If you provide exactly 10 digits, the app assumes an Indian mobile number and prefixes `91`. Other values must already include a full 10-15 digit number.

After signing in as an admin, you can update `SITE_NAME`, the AI provider settings, and `SITE_URL` from the control panel under **Identities**. Saving from the panel persists the values to both the database and the current `.env` file.

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
- runs the Next.js dev server on the host port set by `APP_PORT` (the included `.env` uses `http://localhost:17080`) and publishes it on all host interfaces
- seeds the default admin on first boot and preserves database-managed credentials on later restarts
- rebuilds the app image when code changes are detected, so container restarts keep using the latest baked-in code
- layers app code changes on top of `IRECONX_BASE_IMAGE` instead of rebuilding the full dependency stack every time

For the Compose dev instance, prefer a `.env` that points `DATABASE_URL` at `db`, for example:

```env
DATABASE_URL="postgresql://postgres:postgres@db:5432/ireconx?schema=public"
APP_PORT="17080"
SITE_NAME="iReconX Analytics Studio"
SITE_URL="https://ireconx.sigstack.com"
AI_COPILOT_ENDPOINT="https://models.github.ai/inference/chat/completions"
AI_COPILOT_MODEL="openai/gpt-4.1"
AI_GEMINI_ENDPOINT="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
AI_GEMINI_MODEL="gemini-2.5-flash"
AI_MISTRAL_ENDPOINT="https://api.mistral.ai/v1/chat/completions"
AI_MISTRAL_MODEL="mistral-large-latest"
SEED_ADMIN_EMAIL="admin@ireconx.local"
SEED_ADMIN_PASSWORD="ChangeMe123!"
```

## 5. Sign in

Use the seeded admin credentials:

- Email: `SEED_ADMIN_EMAIL`
- Password: `SEED_ADMIN_PASSWORD`

If the account has a registered mobile number, the app sends a 6-digit OTP through the configured external provider before sign-in completes. After verification, admins are redirected to `/admin`; standard users are redirected to `/dashboard`.

## Common workflows

### Containerized development

```bash
docker compose up --build --watch
```

This launches the Next.js app and PostgreSQL. The app container includes the tidyverse runtime used by Transform Studio tidyverse nodes.

### Base image workflow

Build and push the reusable base image:

```bash
docker build -f Dockerfile.base -t andycyx/ireconx:base .
docker push andycyx/ireconx:base
```

The Compose app service uses `IRECONX_BASE_IMAGE` and defaults it to `andycyx/ireconx:base`, so later app rebuilds only need to apply repository updates on top of that base.

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

- Confirm the database does not already contain an admin with a different password.
- If you need to reset the seeded login on a dev database, delete the existing admin row or update the password hash in PostgreSQL before running `npm run db:seed` again.
- Make sure the app is using the same database configured in `DATABASE_URL`.

### Encrypted data source creation fails

- Ensure `ENCRYPTION_SECRET` or `JWT_SECRET` is set.
- Prefer a dedicated `ENCRYPTION_SECRET` instead of relying on the fallback.
