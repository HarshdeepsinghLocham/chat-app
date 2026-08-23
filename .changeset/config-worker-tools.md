---
"@semantask/task-worker": patch
---

Parse worker tool credentials and the email-domain allowlist through `apps/task-worker/config/tools`.

`ALLOWED_EMAIL_DOMAINS` remains an alias of `TASK_WORKER_ALLOWED_EMAIL_DOMAINS`. Env names are unchanged.
