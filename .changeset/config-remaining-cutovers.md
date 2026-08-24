---
"@semantask/services": patch
"@semantask/task-worker": patch
"@semantask/web": patch
"@semantask/socket": patch
---

Bake remaining config cutovers: accept never enqueues execution, inbox always on, FSM authoritative, `TASK_TOOL_RBAC` default enforce, `TASK_PROMPT_GUARD` default monitor, drop `NEXT_PUBLIC_APP_URL` Docker ARG, and hard-cut dual-read aliases except `INTERNAL_SECRET`.
