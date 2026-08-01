---
"@semantask/auth": patch
"@semantask/db": patch
"@semantask/web": patch
---

Enforce admin force-password-change via a persisted mustChangePassword flag: set on force, clear on password change, expose on login, and block refresh/Google OAuth until changed.
