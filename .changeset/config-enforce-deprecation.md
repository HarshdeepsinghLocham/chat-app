---
"@semantask/services": patch
"@semantask/task-worker": patch
---

Deprecate `EXECUTION_MODE_ENFORCE=0` with a one-time boot/read warning. Shadow (`0`) is still honored this release; the next cutover ignores it.
