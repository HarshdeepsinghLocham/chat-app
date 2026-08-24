---
"@semantask/task-worker": patch
---

Parse FSM migration flags through `apps/task-worker/config/migration` and derive `getFsmRollout()` from the existing env names.

Individual parsers keep today's defaults and mixed-flag behavior; env variable names are unchanged.
