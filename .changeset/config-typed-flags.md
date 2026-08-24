---
"@semantask/services": patch
---

Extract deploy-wide product flags into `@semantask/services/config` and document actual env defaults.

Existing imports from `organization-policy.service` and `message-classifier.service` still work (re-exports). Env variable names are unchanged.
