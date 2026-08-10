# Authentication and Session Model

## Purpose

`packages/auth` is the single source of authentication logic for the platform.
It serves three trust planes:

1. The Next.js web app (`apps/web/app/api/auth/*` route handlers).
2. The Socket.IO transport process (`apps/socket`) via the access-token
   handshake.
3. The task worker (`apps/task-worker`), indirectly, by validating tokens on
   outbound calls into the web app.

The package implements **stateless access tokens** + **stateful refresh
sessions** with **device fingerprint metadata**, optional **OTP**-based
**account** email verification (login/register only), optional **Google OAuth**,
and **token-version-based revocation**.

**Session maintenance is not step-up authentication.** Normal token refresh,
application bootstrap, middleware, API requests, and socket authentication do
**not** create OTP challenges, require step-up verification, or redirect to a
challenge page.

This document describes the lifecycle, persistence boundaries, and trust
properties. Socket authorization specifics live in
[ADR-003](../decisions/ADR-003-socket-authorization-bridge.md).

## Responsibilities

- Generate, verify, and rotate access/refresh JWTs.
- Persist refresh sessions in MongoDB with hashed token, device metadata, TTL.
- Issue OTPs to email for **registration / account verification only** (not for
  session refresh).
- Audit auth events in a queryable log (including historical `step_up_*` rows).
- Provide HTTP and socket middleware shims for downstream services.

## Trust Model

The system is built on two distinct token classes, **issued separately and
verified independently**.

| Class | Algorithm | Secret | TTL | Stored? | Purpose |
|---|---|---|---|---|---|
| Access | HS256 | `ACCESS_TOKEN_SECRET` | 15 min | No (bearer-only) | Per-request auth on REST and socket. |
| Refresh | HS256 | `REFRESH_TOKEN_SECRET` | 7 days | Yes, **hashed** | Mint new access tokens; bound to a `Session` document. |

Both secrets are required at startup (`packages/auth/config.ts:requiredEnv`)
and are read once into `authConfig` via lazy getters. Cookie names are
fixed: `accessToken`, `refreshToken`. Cookie config (`secure`, `httpOnly`,
`sameSite`) is centralized in `getCookieConfig()` and toggles by
`NODE_ENV`.

Token payload structure (`packages/auth/tokens/types.ts`):

```ts
type AccessTokenPayload  = { sub, role, tokenVersion, type: "access"  };
type RefreshTokenPayload = { sub, role, tokenVersion, type: "refresh", sessionId };
```

Algorithm pinning is **explicit** at every verification site
(`jwt.verify(token, secret, { algorithms: ["HS256"] })`). Type field gating
prevents access-token misuse on refresh routes and vice versa.

### tokenVersion as the global revocation switch

`User.tokenVersion` is monotonically incremented to invalidate every token
ever issued for that user. Both refresh and access verification require
`token.tokenVersion === user.tokenVersion`. There are two writers:

- `invalidateAllUserTokens(userId, reason)` in
  `packages/auth/tokens/invalidate.ts`. Increments the version and
  `deleteUserSessions(userId)` for explicit revocation
  (password change, account compromise, suspicious activity).
- `revokeUserAuthSessions(userId)` in `services/revoke-user-auth.service.ts`.
  Same primitives, intended for admin/security flows.

Because the version check happens server-side, **a stolen access token can be
invalidated mid-flight** by bumping the version. The token will continue to
verify cryptographically until the validator queries the user record and
finds a higher version.

## Session Persistence

`SessionModel` (`packages/auth/repositories/sessionModel.ts`):

```
{
  _id: ObjectId,
  userId: ObjectId   (indexed),
  refreshTokenHash: String  (select: false),
  deviceId: String,          // fingerprint hash stored as device metadata
  userAgent: String,
  ipAddress: String,
  expiresAt: Date    (TTL index: expireAfterSeconds: 0),
  revokedAt?: Date,
  state: "active" | "step_up_pending",  // see Legacy session state
  createdAt, updatedAt, lastActiveAt
}
```

Critical properties:

- `refreshTokenHash` is hashed with SHA-256 (`session/token-hash.ts`) and
  marked `select: false` so it never leaks via accidental projection. The
  raw refresh token is **never** stored.
- `expiresAt` has an `expireAfterSeconds: 0` TTL index → MongoDB
  auto-deletes expired sessions. There is no garbage-collection process
  the application owns.
- `deviceId` stores a SHA-256 fingerprint derived from
  `(deviceId, userAgent, ipBucket)` at session creation for audit/metadata.
  It is **not** used to gate refresh or trigger challenges.

### Legacy session state (`step_up_pending`)

`state: "step_up_pending"` remains in the schema **only for backwards
compatibility** with rows written by a removed step-up flow. New sessions
always start as `active`. Refresh/rotation sets `state: "active"`, so legacy
pending rows normalize without OTP. This is **not** an active step-up
authentication mechanism.

### Session creation

`createUserSession(input)` in `packages/auth/session/create-session.ts`:

1. Generate `sessionId = new ObjectId().toString()`.
2. Call `generateRefreshToken({ sub, sessionId, tokenVersion, type: "refresh" })`.
3. Hash the raw refresh token via `hashToken(...)`.
4. Compute device fingerprint metadata via `generateDeviceFingerprint(...)`.
5. `createSession({ ... })` writes the document with `state: "active"` and
   `expiresAt = now + refresh TTL`.
6. Return `{ refreshToken, session }`. The raw token is returned **once** to
   be set as an HTTP-only cookie.

### Session verification (refresh path)

`verifySession({ refreshToken })` in
`packages/auth/session/verify-session.ts`:

1. `verifyRefreshToken(refreshToken)` — JWT signature, `type === "refresh"`,
   extract `{ sub, sessionId, tokenVersion, role }`.
2. `findSessionByIdWithToken(sessionId)` — fetch session **with**
   `refreshTokenHash` (overrides `select: false`).
3. Existence + ownership: session exists, `userId === sub`.
4. `revokedAt === null` and `expiresAt > now`.
5. `tokenHashEquals(refreshToken, session.refreshTokenHash)` — constant-time
   comparison after re-hashing. If false the token is either forged or has
   been rotated out from under the holder. This is the **session-hijack
   detection** point.

## Refresh Flow (MVP contract)

`refreshService({ refreshToken })` in
`packages/auth/services/refresh.service.ts`:

**Normal session**

```
access token expires / missing
  → valid refresh token
  → verifySession + user/tokenVersion checks
  → rotate refresh token hash (state → active)
  → issue new access + refresh tokens
  → continue
```

**Invalid / revoked / expired refresh**

```
invalid or revoked refresh token
  → authentication failure (401)
  → client clears session / redirects to login
  → login recovery
```

```
┌────────────────────────────────────────────────────────────────────┐
│ verifySession(refreshToken)                                         │
│   └── On failure: throw → 401, no session changes, no challenge.   │
│                                                                      │
│ Fetch user; reject deleted / inactive / mustChangePassword           │
│ Verify user.tokenVersion === token.tokenVersion                      │
│   └── Mismatch → revoke session → throw                             │
│                                                                      │
│ generateRefreshToken({...})  → newRefreshToken                       │
│ rotateSessionTokenHash(sessionId, hashToken(newRefreshToken))        │
│   └── also sets state: "active" (clears any legacy step_up_pending)  │
│ generateAccessToken({...})   → newAccessToken                        │
│                                                                      │
│ Return tokens (route sets cookies + refresh_success audit)           │
└────────────────────────────────────────────────────────────────────┘
```

There is **no** fingerprint gate, **no** `StepUpChallenge` creation, and
**no** redirect to `/auth/challenge` on this path. Device fingerprint drift
does not interrupt session maintenance.

The rotation is **always** done on a successful refresh — there is no
re-use window. A single refresh token is a one-shot credential. Reuse of an
older refresh token after rotation results in
`tokenHashEquals → false` on the next verify (because the hash in the DB now
matches the **new** token). This converts refresh-token theft into an
observable signal: the legitimate client and the attacker race; the loser
gets `Invalid session token` (mapped to 401).

The system does **not** explicitly classify this as "session hijack
detected → revoke all" — it returns 401 to whichever client made the second
call. A stronger defense would be to detect the mismatch and bump
`tokenVersion`, killing all sessions. This is documented as Technical Debt
below.

## What does **not** trigger OTP / step-up

The following paths use normal authentication and authorization only:

| Surface | Behavior |
|---|---|
| `/api/auth/refresh` | Rotate tokens or 401; never creates a challenge. |
| Web middleware | Allows refresh-cookie recovery; no step-up-status check. |
| Auth bootstrap (`/api/me` + silent refresh) | Recover session or login; no challenge redirect. |
| Authenticated API clients | 401 → silent refresh → retry or login. |
| Socket connect / reconnect | Access JWT + identity/conversation AuthZ bridges. |
| Conversation / identity authorization | Membership and policy checks only. |

Step-up authentication, if reintroduced later, must be an **explicit**
security boundary around a genuinely sensitive operation — not part of
session refresh.

## Device fingerprint metadata

`packages/auth/session/fingerprint.ts` exposes
`generateDeviceFingerprint({ deviceId, userAgent, ipAddress })` used when
**creating** a session. It hashes a stable device id when present, otherwise
UA + IP bucket (`/24` for IPv4). Stored values support audit/forensics; they
are not compared during refresh in the MVP contract.

## OTP Service (Registration / Email Verification Only)

`packages/auth/services/otp.service.ts` provides **account verification**
during login/register flows. It is **unrelated to session refresh**:

- `sendEmailOtpService(email)` → 6-digit OTP, hashed and persisted in
  `Otp` model, then `sendOtpEmail`. `OTP_COOLDOWN_MS` prevents resends
  within the cooldown window.
- `verifyEmailOtpService({ email, otp })` → finds the most recent un-used
  OTP for the email, validates expiry (`OTP_EXPIRY_MS`), validates the
  hash via constant-time compare, and marks it consumed.
- `verifyOtpAndRegisterService({ email, otp, name, password? })` →
  combines verification with `register.service.ts` or retrieval of an
  existing user.

Web routes: `/api/auth/sendOtp`, `/api/auth/verify-otp` (and register).
There is no `/auth/challenge` page and no step-up OTP challenge model.

The OTP table uses a unique compound index that intentionally allows multiple
OTPs per email over time (cooldown-bounded); on verification, the latest is
used.

## Login Paths

| Path | File | Output |
|---|---|---|
| Password | `services/login.service.ts` | `{ accessToken, refreshToken, user }` |
| Google OAuth | `services/google-oauth.service.ts:loginWithGoogleCode` | Same; auto-links by `googleSub`, never by email-only (`ensureGoogleProviderLinked` rejects with `GOOGLE_ACCOUNT_NOT_LINKED` if a password account exists without a `googleSub`). |
| OTP-only registration | `verifyOtpAndRegisterService` | Same. |

All paths funnel through `createUserSession`, so refresh-token rotation works
identically regardless of how the user authenticated.

## Logout

`services/logout.service.ts`:

- Default: `deleteSession(sessionId)` — removes only the current session.
  Other devices remain logged in until their refresh tokens expire or a
  full revocation runs.
- `logoutFromAllDevices: true`:
  `invalidateAllUserTokens(userId, "user_logout_all")` →
  `User.tokenVersion += 1` + `deleteUserSessions(userId)`. **Every access
  token previously issued is invalidated on next server check**, and every
  refresh session is gone.

## Audit Log

`services/auth-audit.service.ts` writes to `AuthEventModel`
(`repositories/authEventModel.ts`). Every login, refresh, logout, OAuth,
password change, and revocation emits one row with:

- `eventType` (enum values including historical `step_up_triggered` /
  `step_up_success` / `step_up_failed` for rows written by the removed flow).
- `outcome: "success" | "failure"`.
- `userId` (if known), `email`, `ipAddress`, `userAgent`, `reason`,
  `metadata`.

Admin UI can still filter the historical `STEP_UP` event group for forensics.
The application no longer emits new step-up events during normal session
maintenance.

The write is **best-effort**: if the DB connection is not ready
(`connection.readyState !== 1`) the write is silently skipped. Errors are
caught and `console.error`'d but never thrown — auth flows never fail
because the audit log is down. This is the right tradeoff for availability
but means alerting must compare audit-log counts against application
metrics to detect log loss.

Indexes on `(eventType, createdAt)`, `(userId, createdAt)`, `(createdAt)`
support common queries.

## Middleware Surface

`packages/auth/middleware/`:

- `http-auth.ts:authenticateHttpBearer(header)` — Parses
  `Authorization: Bearer ...`, calls `verifyAccessToken`, returns
  `{ userId, role, tokenVersion }`. Does **not** check
  `User.tokenVersion` against the DB; callers (e.g. Next.js route
  handlers) are expected to do that themselves if they care about
  mid-flight revocation.
- `socket-auth.ts:authenticateSocketToken(token)` — same verify wrapper
  for the socket process's pre-bridge check. The DB check happens in the
  socket process via `authorizeSocketIdentity` (see ADR-003).

The split is intentional: `packages/auth` knows JWTs; the **caller**
decides whether to additionally check `tokenVersion` against the DB. The
socket server always does (via the bridge). REST endpoints typically rely
on a Next.js middleware (not in this package) that verifies the access
cookie and, when only a refresh cookie remains, **allows the request through**
so client/server refresh can recover — without any step-up gate.

## Configuration

`packages/auth/config.ts`:

- `requiredEnv(name)` throws if env var is missing.
- `getAccessTokenConfig()` → `{ secret, expiresIn: "15m" }`.
- `getRefreshTokenConfig()` → `{ secret, expiresIn: "7d" }`.
- `getSessionConfig()` → `{ ttlMs: 7 * 24 * 60 * 60 * 1000 }`.
- `getCookieConfig()` → cookie names and `{ httpOnly, secure, sameSite }`
  toggled by `NODE_ENV === "production"`.
- All wrapped in `authConfig` object whose getters lazy-evaluate; this lets
  tests stub env vars before the first read.

Hard-coded constants the user should know about:

- Access token TTL: `15m` (`tokens/generate.ts`).
- Refresh token TTL: `7d` (`tokens/generate.ts`).
- Session TTL: matches refresh TTL.
- OTP cooldown: `OTP_COOLDOWN_MS` env, default 60s (verify in
  `otp.service.ts`).
- OTP expiry: `OTP_EXPIRY_MS` env.

## Tradeoffs

- **Stateless access + stateful refresh**. Standard pattern; 15-min
  access TTL caps the blast radius of a stolen access token. The 7-day
  refresh TTL is generous; reducing it would increase user friction.
- **Fingerprint as metadata only**. Storing device fingerprint without
  gating refresh avoids OTP interrupts during normal use. Stronger
  risk-based step-up, if needed later, must be opt-in around sensitive
  actions — not refresh.
- **One-shot refresh rotation**. Rotating on every refresh prevents
  reuse, at the cost of "double-tap refresh" failures (network glitches
  that cause the client to re-send the same refresh). The server has no
  retry-safe re-issue window.
- **`tokenVersion` instead of per-token revocation list**. A single bump
  invalidates *all* tokens; you cannot revoke a single device without
  bumping the version (which would log out all devices). Single-device
  logout is therefore session-based only, and a stolen access token from
  device X cannot be revoked without taking down device Y.
- **Best-effort audit logging**. Auth never fails due to logging failures.
  Audit completeness is therefore not guaranteed; production must
  cross-check audit row counts against application metrics.

## Failure Handling

| Failure | Behavior |
|---|---|
| Refresh JWT signature invalid | `verifySession` throws → 401. |
| Refresh JWT shape invalid (missing `sessionId`, wrong `type`) | Same as above. |
| Session not found or revoked | → 401. |
| Session expired | → 401. Also auto-deleted by TTL index. |
| Refresh hash mismatch (token rotated or forged) | → 401. No challenge creation. |
| `tokenVersion` mismatch | Session revoked; → 401. |
| Account inactive / deleted / password change required | → auth failure (no challenge). |
| User banned / deleted mid-session | Caught by `authorizeSocketIdentity` bridge call on next socket op; REST routes must call `validateAuthUserById` themselves. |
| MongoDB unreachable | `verifySession` rejects (cannot find session); audit log silently skipped; auth returns 503 where connectivity is detected. |

## Scalability Considerations

- Refresh path requires a session document read + a hashed compare + a
  rotate write — three round-trips to MongoDB per refresh. With a single
  refresh every 15 minutes per active user, this is bounded but should
  not be ignored at scale. `findSessionByIdWithToken` is indexed by `_id`.
- The `User` collection is read on every refresh for the
  `tokenVersion` check. This is a single keyed lookup (indexed) but it is
  on the hot path; consider a short-TTL Redis cache keyed on
  `(userId, tokenVersion)` similar to `validateAuthUserById` in the
  socket bridge.
- `AuthEventModel` writes are append-only and unbounded in size. A
  retention strategy (TTL index on `createdAt`?) is **not** in the model.
- Session TTL is enforced by Mongo at sweep time, so cluster-wide growth
  is bounded by `activeUsers × deviceCount`.

## Technical Debt / Limitations

1. **Refresh-hash mismatch is not treated as a security event**. A stolen
   refresh token races with the legitimate user. The loser sees 401. A
   stronger response is to bump `tokenVersion` on detected mismatch and
   log a security event with reason `refresh_reuse`. Today, the loss is
   silent.
2. **No revocation list for individual tokens**. The only revocation
   primitives are session deletion (this session) and `tokenVersion` bump
   (all sessions). Per-device revocation requires either of these.
3. **`AuthEventModel` has no TTL**. Without a retention policy, the
   audit log grows unbounded.
4. **`authenticateHttpBearer` does not check `tokenVersion` against the
   DB**. Web routes that depend on instant revocation must wrap the
   middleware with an extra check. The socket process does this in the
   bridge; REST does not have a uniform pattern.
5. **Google OAuth account linking is by exact `googleSub` only**.
   `ensureGoogleProviderLinked` will reject if a password account exists
   for the same email without a `googleSub` — this is the safe default,
   but UX-wise the user sees `GOOGLE_ACCOUNT_NOT_LINKED` with no
   recourse outside `/api/auth/link/google-link` (which lives in the web
   app, not here).
6. **No mTLS or asymmetric JWT (e.g. RS256)**. HS256 with shared secrets
   is fine for internal-only verifiers but rules out third-party token
   consumers.
7. **Legacy `step_up_pending` enum value** remains on `SessionModel` until
   a deliberate data migration drops it; runtime never writes it for new
   sessions.

## Future Evolution

- Add `tokenVersion` bump on refresh-hash mismatch (cheapest theft
  defense).
- Cache `(userId → tokenVersion)` in Redis with a short TTL for the
  refresh hot path; invalidate on `invalidateAllUserTokens`.
- Switch refresh JWT signature to RS256 if external services need to
  verify without holding `REFRESH_TOKEN_SECRET`.
- Add a TTL or archival job on `AuthEventModel`.
- Consider per-device opaque refresh tokens (random 256-bit string +
  session id) instead of JWTs; the JWT carries no useful info that isn't
  already stored on the session row, and an opaque token shortens
  exposure if the secret leaks.
- If risk-based step-up returns, bind it to explicit sensitive operations
  only — never to access-token refresh or normal bootstrap.

## Uncertain

- The exact behavior of `validateAuthUserById` (referenced by the socket
  bridge) is not in `packages/auth`; it lives in
  `apps/web/lib/utils/auth/`. Its caching strategy was inspected during
  socket review but is not centralized in this package.
- The HTTP middleware in this package is a thin verifier; the
  user-facing route handlers in `apps/web/app/api/auth/*` add cookie
  handling and rate limiting (rate limiting was not exhaustively traced).
- The Google OAuth `state` cookie validation is performed in the route
  handler, not in `google-oauth.service.ts`. A cross-check of the route
  is needed to confirm CSRF protection on the OAuth callback.
