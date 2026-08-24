---
"@semantask/task-worker": patch
---

Parse task-worker LLM and runtime knobs through `apps/task-worker/config`. Credential, base URL, and provider come from `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_PROVIDER` only.
