---
"@semantask/types": minor
"@semantask/db": minor
---

Phase 1 PR1 — WorkSuggestion domain types and Mongoose model (reviewable proposed work, distinct from MessageIntent facts and Task committed work).

### Added
- `WORK_SUGGESTION_STATUSES` / `WorkSuggestionRecord` under `packages/types/work/`
- `WorkSuggestion` model with org/conversation indexes and partial-unique `messageId` while `status=proposed`
