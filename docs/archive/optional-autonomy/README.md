# Optional autonomy — operator docs

These docs describe the **task-worker LLM layer** and env recipes. They support Semantask when autonomous execution is enabled; they are **not** the product spine.

See [ADR-005](../../decisions/ADR-005-suggest-first-work-coordination.md).

| Doc | Topic |
|-----|--------|
| [oss-inference-compatibility.md](./oss-inference-compatibility.md) | Provider matrix, env flags, degradation |
| [LLM_PROVIDER_ARCHITECTURE.md](./LLM_PROVIDER_ARCHITECTURE.md) | Provider abstraction design |
| [task-worker-execution-flow.md](./task-worker-execution-flow.md) | Outbox → agent run control flow |
| [examples/](./examples/) | vLLM/TGI, Hugging Face, AMD env recipes |
