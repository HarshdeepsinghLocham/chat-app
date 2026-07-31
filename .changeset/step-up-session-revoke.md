---
"@semantask/auth": patch
---

Revoke password step-up sessions on non-retryable user-state failures (missing user, inactive account, password auth unavailable), while keeping the session pending for incorrect-password retries.
