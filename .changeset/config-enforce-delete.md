---
"@semantask/services": patch
"@semantask/task-worker": patch
---

Stop reading `EXECUTION_MODE_ENFORCE`. `isExecutionModeEnforce()` is a constant `true`; the env name is unused.
