---
"@semantask/web": patch
---

Intent badge “Review suggestion” CTA deep-links to a read-only WorkSuggestion detail stub when a suggestion exists for the message.

### Added
- Client helpers `listWorkSuggestions` / `getWorkSuggestion`
- Conversation suggestion index (refresh on `message:semantic_updated`)
- Intent badge CTA → `/work-suggestions/[id]` (no accept/dismiss)
