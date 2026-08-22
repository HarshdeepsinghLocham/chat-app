---
"@semantask/task-worker": patch
"@semantask/web": patch
"@semantask/socket": patch
---

Worker Redis is `REDIS_URL` only (`UPSTASH_REDIS_REST_URL` is web REST, not ioredis). Boot warns once when only a dual-read alias is set; alias reads are unchanged.
