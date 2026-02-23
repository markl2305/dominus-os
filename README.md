[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.18654921.svg)](https://doi.org/10.5281/zenodo.18654921)

# Dominus OS

**The Human-Governed AI Hypervisor**

Dominus OS is a human-governed AI hypervisor -- a control layer beneath AI execution that mediates all system actions through a unified governance architecture. Built on a microkernel with a mandatory syscall gate, capability-based authority model, event-sourced determinism, and tenant isolation, the system enforces structural guarantees that monitoring and policy alone cannot provide.

The objective is not more automation, but trustworthy automation: systems that remain accountable to human intent, deterministic under audit, and governable when outcomes matter.

## The Convergence Problem

Each era of software abstraction solved one structural problem while creating the conditions for the next. Monoliths centralized control. SaaS fragmented data. APIs created dependency complexity. AI copilots confined reasoning to individual sessions. Autonomous agents removed humans from the decision chain. Tool proliferation produced cognitive fragmentation.

The absence of a governed execution substrate is the limiting factor in the current AI stack. The next abstraction layer is not another tool. It is a hypervisor.

## Architectural Thesis

Governance must move beneath runtime. Rather than wrapping AI systems in external policy, Dominus OS positions a hypervisor layer between AI processes and the infrastructure they act upon. Every action passes through a syscall gate that enforces scoped, revocable capabilities before execution proceeds. Authority is not assumed. It is granted, bounded, time-limited, and auditable.

This is the distinction between a governed system and a monitored one. Monitoring records what happened. A hypervisor determines what is permitted to happen.

## Core Architecture

1. **Syscall Gate** -- the mandatory mediation point for all AI execution. No process writes, communicates, deploys, or commits resources without passing through the gate. The gate enforces authority checks, logs to an immutable event ledger, and applies governance rules before permitting execution.
2. **Capability-Based Authority** -- every process operates within an explicit capability envelope. Capabilities define scope, time bounds, and attribution. Granted by human operators, transitively revocable, following the principle of least authority.
3. **Event-Sourced Determinism** -- every state change is captured as an immutable, sequenced event. Full system state is reconstructible by replay. No silent state mutations, no unrecorded side effects, no gaps in the attribution chain.
4. **Tenant Isolation** -- organizational domains execute within isolated boundaries. No cross-domain data access, capability escalation, or execution context leakage without explicit authority grants.
5. **Microkernel Architecture** -- the kernel manages process scheduling, capability enforcement, the syscall gate, and the event ledger. All domain logic, integrations, and services run in user space. A fault in any driver or integration cannot crash the kernel or affect other subsystems.

## Structural Guarantees

Six invariants enforced by architecture, not by policy:

1. **Replay Determinism** -- any execution sequence can be replayed from the event log and will produce identical, verifiable results
2. **Capability Enforcement Integrity** -- no process can exceed its granted capabilities; enforcement is mandatory and architectural
3. **Tenant Isolation Integrity** -- no cross-tenant data access, capability escalation, or execution context leakage is structurally possible
4. **Revocation Cascades** -- when a capability is revoked, all derived capabilities are transitively and immediately revoked
5. **Driver Fault Containment** -- a failure in any driver, integration, or user-space service cannot propagate to the kernel
6. **Canon Immutability** -- the system's constitutional governance rules cannot be modified by any process, including privileged ones

## What Is Running Today

- **Multiple virtual employees** -- governed workflows across email, CRM, document processing, compliance enforcement, and operational intelligence
- **Structured knowledge layer** -- versioned, graph-connected nodes for decisions, projects, doctrine, and operational knowledge with full provenance
- **Governed CRM operations** -- full-funnel attribution, composite engagement scoring, automated follow-up enforcement, stale data detection
- **Operator assembly surface** -- structured editing environment for decision modeling, doctrine management, and progressive knowledge typing
- **Native operator applications** -- macOS (Swift) and iOS with live process visibility, tab-based task management, and direct kill authority
- **Autonomous scheduled operations** -- running under governance with full attribution chains and immutable activity ledger
- **Governed learning engine** -- improving system intelligence weekly under explicit human authority
- **System-level kill switch** -- tested regularly; one action halts all AI execution across every subsystem

## Roadmap

The hypervisor architecture is designed for extension beyond cloud-based AI workforces:

- **Current:** Enterprise AI governance -- founding deployments with organizations requiring governed AI operations and auditable execution
- **Near-term:** Multi-tenant platform -- scaling the hypervisor to support multiple organizations within isolated tenant boundaries
- **Long-term:** Autonomous infrastructure and IoT -- extending the syscall gate and capability model to device-level authority grants, edge-local governance enforcement, and physical-world action mediation. The IoT extension layer is stubbed in the current architecture.

AI governance today. Autonomous infrastructure tomorrow.

## Documentation

- [Technical White Paper v1.0 (Markdown)](docs/Dominus_OS_Technical_White_Paper_v1_0.md) -- the canonical thesis document
- [Technical White Paper v1.0 (Web)](https://dominusos.ai/whitepaper) -- the live web version
- [Architecture Overview](docs/ARCHITECTURE.md) -- core components and design principles

## Links

- **Website:** [dominusos.ai](https://dominusos.ai)
- **Company:** [Dominus Foundry](https://dominusfoundry.com)
- **Author:** Mark Lord (mark@dominusfoundry.com)

## Citation

If referencing this work, please cite:

> Lord, M. (2026). *Dominus OS: The Human-Governed AI Hypervisor.* Dominus Foundry. https://dominusos.ai

## License

The documentation in this repository is licensed under [CC BY-ND 4.0](LICENSE). You may share and cite this work with attribution. Modifications to the documents are not permitted.

The Dominus OS software itself is proprietary and not included in this repository.
