---
"@semantask/web": patch
"@semantask/socket": patch
---

Parse web and socket deploy knobs through typed config helpers without renaming env vars.

SMTP still dual-reads `EMAIL_USER` / `EMAIL_PASS`. Client files keep `NEXT_PUBLIC_*` via a client-safe helper.
