# ADR-005: Suggest-First Work Coordination

- Status: Accepted
- Date: 2026-08-03
- Related: [ADR-004](./ADR-004-personal-and-optional-organizations.md)
- Supersedes (product north star only): [Production Roadmap V1](../archive/PRODUCTION_ROADMAP_V1.md) autonomy-first framing
- Note: Phased product roadmap is tracked in Notion, not in this repository.

## Context

V1 built a trustworthy async task-worker, classifier, approvals, org policy, and audit trail. Product messaging still centered **autonomous execution**. The intended product is an **AI-native work coordination platform**: teams talk, AI extracts work, managers approve and see org-wide status. Autonomy is a gated capability, not the default experience.

## Decision

1. **Suggest-first is the default.** Ingress classification produces reviewable work suggestions (or intent rows with suggestion lifecycle). It does **not** enqueue tool-running execution unless an explicit execution mode allows it.
2. **Create task ≠ allow AI tools.** Accepting a suggestion creates coordinated work (owner, due, status). Enabling autonomous tool runs is a separate approval/policy step.
3. **Execution modes** (org and personal overlays): `suggest_only` (default) · `require_approval` · `auto_execute` (allowlisted intents/tools only).
4. **Manager surfaces are primary UX.** Work inbox, approvals, and org visibility outrank the task orchestration / run-detail panel. The panel remains a drill-down for optional runs.
5. **Personal + optional orgs (ADR-004) remain.** No forced tenancy. Org policy can tighten defaults; personal stays env-driven until product settings exist.
6. **V1 runtime ADRs stay in force** for worker correctness (ADR-001 lifecycle, ADR-002 retry, ADR-003 socket bridge) when autonomy is enabled.

## Consequences

- README and roadmap lead with coordination, not agents.
- Heavy LLM/provider and worker-flow docs move under `docs/archive/optional-autonomy/`.
- Policy and `OrganizationPolicy` gain a first-class execution-mode field (suggest-first rollout).
- False auto-execute is a product bug when mode is `suggest_only`.

## Non-goals

- Removing the task-worker or LLM provider abstraction.
- Forcing every workspace into an organization.
- Claiming “fully autonomous employees” as the product promise.
