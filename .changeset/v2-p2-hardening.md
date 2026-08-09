---
"@semantask/db": patch
"@semantask/observability": minor
"@semantask/services": minor
---

Phase 2 hardening — emit `work.suggestion.accepted|dismissed` outbox events, triage accept/dismiss metrics + latency, and accept→execution-while-disabled safety signal. AuthZ matrix documented as conversation participant OR org owner/admin (no behavior change; no conversation manager role).
