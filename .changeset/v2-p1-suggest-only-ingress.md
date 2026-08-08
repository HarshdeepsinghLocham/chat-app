---
"@semantask/services": minor
"@semantask/observability": minor
"@semantask/task-worker": patch
---

 Classifier ingress creates reviewable WorkSuggestions under `suggest_only` without enqueueing execution.

### Added
- `SUGGESTION_INGRESS` / `SUGGESTION_BLOCK_EXEC` flags and `shouldBlockExecutionEnqueue`
- Dual-write: actionable classify → MessageIntent + idempotent WorkSuggestion (`SUGGESTION_INGRESS=1`)
- Shared enqueue guard: refuse `task.execution.requested` at the worker/enqueue boundary under suggest_only
- Worker defense-in-depth for leaked execution events; `classifier_disagreement_total` hook
- Metrics: `suggestions_created_total`, `suggestion_latency_ms`, `execution_enqueue_attempted_while_suggest_only_total` + P0 alert

### Compatibility
- `SUGGESTION_INGRESS=0` (default) preserves legacy classify → Task → enqueue behavior
