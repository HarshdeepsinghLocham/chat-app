---
"@semantask/web": patch
---

Drop unread leftovers from `env.sample` and Turbo `globalEnv`: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `APP_NAME`, `EMAIL_SENDER_NAME`, `NEXT_PUBLIC_API_URL`.

Keep SMTP / `EMAIL_USER` aliases and the Docker `NEXT_PUBLIC_APP_URL` ARG until a dedicated follow-up.
