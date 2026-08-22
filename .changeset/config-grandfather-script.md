---
"@semantask/services": patch
---

Add an ops one-shot to persist `executionMode: auto_execute` for `GRANDFATHER_AUTO_TENANTS`, then clear that env in the same deploy. The parser stays until the list is empty.
