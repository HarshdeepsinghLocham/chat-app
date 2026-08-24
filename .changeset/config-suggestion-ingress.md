---
"@semantask/services": patch
"@semantask/task-worker": patch
---

WorkSuggestion ingress is always on. `shouldBlockExecutionEnqueue` is `suggest_only` only. `SUGGESTION_INGRESS` and `SUGGESTION_BLOCK_EXEC` are no longer read.
