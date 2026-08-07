---
"@semantask/types": minor
"@semantask/db": minor
"@semantask/services": minor
"@semantask/task-worker": minor
"@semantask/web": patch
---

ADR-005 S0.2 — default workspace `executionMode` (`suggest_only` | `require_approval` | `auto_execute`) with shadow→enforce flags.

### Added
- `ExecutionMode` type and `OrganizationPolicy.executionMode` (+ updatedAt/By)
- `getEffectiveExecutionMode` / `EXECUTION_MODE_ENFORCE` / `DEFAULT_EXECUTION_MODE` / `GRANDFATHER_AUTO_TENANTS`
- Policy GET/PUT surfaces `executionMode`; logs `policy.execution_mode.changed`
- Worker policy gate: enforce + `suggest_only` blocks tools (`EXECUTION_MODE_DENIED`); `require_approval` caps auto-execute; shadow logs; tool-executor fail-closed
