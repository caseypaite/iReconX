# Security

This document describes the current security model for iReconX and the operational expectations around deployment and maintenance.

## Security controls

### Authentication

- Users authenticate with email and password.
- Passwords are hashed with `bcryptjs` before storage.
- Users with a registered mobile number must also complete a 6-digit OTP verification step.
- Successful logins create a signed JWT using `jose`.
- The JWT is stored in the `ireconx_session` cookie with:
  - `httpOnly: true`
  - `sameSite: "lax"`
  - `path: "/"`
  - `secure: true` in production

### Authorization

- The app uses two roles: `ADMIN` and `USER`.
- Edge middleware protects:
  - `/dashboard`
  - `/admin`
  - `/api/admin/*`
  - `/api/explorer/*`
  - `/api/auth/me`
- Server-side API guards independently re-validate the session and allowed roles before executing business logic.

### Session integrity

- Tokens include `sub`, `email`, `role`, `name`, and `sessionVersion`.
- Session validation re-reads the user from the database.
- Access is denied when:
  - the user no longer exists
  - the account is inactive
  - the stored `sessionVersion` no longer matches the token
- Updating a user's password, role, or active status increments `sessionVersion`, invalidating prior cookies.

### Secret protection

- Sensitive data source configuration is encrypted before persistence.
- Encryption uses AES-256-GCM with a key derived from `ENCRYPTION_SECRET` or, if unset, `JWT_SECRET`.
- Use a dedicated `ENCRYPTION_SECRET` in real environments so auth signing and field encryption do not share the same secret material.
- OTP verification codes are stored hashed and compared server-side; raw codes are only sent to the external provider.

### OTP delivery

- Login OTP delivery uses an external provider compatible with `POST /api/v1/message/single`.
- The app authenticates to that provider with the `x-api-key` header.
- OTP enforcement only applies when the user has a registered mobile number on their account.
- Mobile numbers must resolve to 10-15 digits; when exactly 10 digits are supplied, the app assumes an Indian number and prefixes `91`.
- OTP challenges expire after 5 minutes and become invalid after successful use or repeated incorrect attempts.

### Input validation

- Authentication, user management, data source creation, and explorer requests are validated with Zod schemas.
- Invalid payloads are rejected with explicit `400` responses.

### Auditability

- The app records audit events for:
  - login
  - logout
  - user creation
  - user updates
  - user deletion
  - data source creation
  - query execution
- Admin APIs expose recent audit logs for review.

## Deployment recommendations

1. Set strong, unique values for `JWT_SECRET` and `ENCRYPTION_SECRET`.
2. Run behind HTTPS in every non-local environment so secure cookies are always used.
3. Restrict database access to trusted application infrastructure.
4. Seed the initial admin, then rotate the seeded password immediately.
5. Monitor audit logs for unexpected user, auth, or query activity.
6. Keep Node.js, Next.js, Prisma, and PostgreSQL patched.

## Current boundaries

- Explorer query execution is currently a placeholder and does not connect to a live analytics engine.
- There is no rate limiting, MFA, or CSRF-specific token mechanism implemented in this scaffold.
- Data source configuration is encrypted at rest in the database, but secret handling in surrounding infrastructure remains the operator's responsibility.

## Security reporting

If you maintain this project publicly, publish a monitored security contact and a disclosure process before accepting production traffic. Until then, treat issue trackers as unsuitable for sharing exploit details or secrets.
