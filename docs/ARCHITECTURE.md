# Dominus OS -- Architecture Overview

## The Human-Governed AI Hypervisor

Dominus OS is a human-governed AI hypervisor -- a control layer beneath AI execution that mediates all system actions through a unified governance architecture. The system is organized around five structural components, connected by a structured knowledge layer, and anchored by operator sovereignty.

```
 +-----------------------------------------------------------+
 |                  OPERATOR SOVEREIGNTY                      |
 |         Observe . Intervene . Halt . Audit                 |
 +-----------------------------+-----------------------------+
                               |
 +-----------------------------v-----------------------------+
 |                    SYSCALL GATE                            |
 |    Mandatory mediation . Authority checks . Event logging  |
 +-----------------------------+-----------------------------+
                               |
 +-----------+-----------------v-----------------+-----------+
 | CAPABILITY|          MICROKERNEL              | EVENT-    |
 |  AUTHORITY|                                   | SOURCED   |
 |           | Process scheduling                | DETERMIN. |
 | Scoped    | Capability enforcement            |           |
 | Time-bound| Syscall gate management           | Immutable |
 | Revocable | Event ledger                      |   events  |
 | Attributed|                                   | Replay    |
 |           +-----------------------------------+ Audit     |
 +-----------+       TENANT ISOLATION            +-----------+
             |                                   |
             | Domain boundaries enforced        |
             | No cross-tenant leakage           |
             | Blast radius containment          |
             +-----------------------------------+
                               |
 +-----------------------------v-----------------------------+
 |                   USER SPACE                               |
 |                                                           |
 |  Virtual Employees . Integrations . Drivers . Workflows   |
 |  Knowledge Layer . Assembly Surface . Operator Apps       |
 +-----------------------------------------------------------+
```

## Core Components

### Syscall Gate

The mandatory mediation point for all AI execution. No process writes, communicates, deploys, or commits resources without passing through the gate. The gate enforces authority checks against the process's capability set, logs the action to an immutable event ledger, and applies governance rules before permitting execution. The gate is not optional and cannot be bypassed -- it is the only path from intent to action.

### Capability-Based Authority

Every process operates within an explicit capability envelope. Capabilities define what a process may do (scope), for how long (time-bound), and under whose authority (attribution). Capabilities are granted by human operators, are transitively revocable, and follow the principle of least authority. A process cannot access any resource or perform any action for which it does not hold an explicit, unexpired capability token.

### Event-Sourced Determinism

Every state change in the system is captured as an immutable, sequenced event. The complete system state can be reconstructed by replaying the event log from any point. This provides replay determinism: any execution sequence can be audited, verified, and reproduced. There are no silent state mutations, no unrecorded side effects, no gaps in the attribution chain.

### Tenant Isolation

Organizational domains -- CRM, compliance, operations, intelligence -- execute within isolated boundaries. No process in one domain can access another domain's data, capabilities, or execution context without explicit cross-domain authority grants. Isolation limits blast radius, prevents cascade failures, and ensures that a fault or compromise in one domain cannot propagate to others.

### Microkernel Architecture

The kernel is minimal by design. It manages process scheduling, capability enforcement, the syscall gate, and the event ledger. All domain logic, integrations, drivers, and services run in user space outside the kernel boundary. A fault in any driver or integration cannot crash the kernel or affect other subsystems. The design minimizes the trusted computing base and maximizes fault containment.

## Structural Guarantees

Six invariants enforced by architecture, not by policy:

| Guarantee | Description |
|-----------|-------------|
| **Replay Determinism** | Any execution sequence can be replayed from the event log and will produce identical, verifiable results |
| **Capability Enforcement Integrity** | No process can exceed its granted capabilities; enforcement is mandatory and architectural |
| **Tenant Isolation Integrity** | No cross-tenant data access, capability escalation, or execution context leakage is structurally possible |
| **Revocation Cascades** | When a capability is revoked, all derived capabilities are transitively and immediately revoked |
| **Driver Fault Containment** | A failure in any driver, integration, or user-space service cannot propagate to the kernel |
| **Canon Immutability** | The system's constitutional governance rules cannot be modified by any process, including privileged ones |

## User-Space Components

### Virtual Employees

Multiple governed agents executing real work with real tools -- email, CRM operations, document processing, compliance enforcement, operational intelligence -- all within governed capability envelopes.

### Structured Knowledge Layer

A graph of versioned, typed nodes -- decisions, projects, doctrine, contacts, operational knowledge -- connected by directional relationships with full provenance. Three tiers: working memory (ephemeral task context), operational memory (persistent organizational knowledge), and archival memory (immutable historical record). Non-destructive by design: updates create new versions, never overwrite.

### Operator Assembly Surface

A structured editing environment for direct human interaction with the knowledge graph. Block-based editing with progressive typing: freeform drafts can be promoted to structured types (decisions, projects, doctrine) with required fields and lifecycle states.

### Governed Business Workflows

Business-domain workflows (including CRM-class operations) integrated with the governance kernel. All record modifications and external actions pass through the syscall gate. Automated operations handle enforcement, intelligence generation, and compliance under governed schedules.

### Native Operator Applications

macOS (Swift) and iOS applications with live process visibility, tab-based task management, and direct kill authority. Not Electron, not browser wrappers. Real desktop and mobile clients connected to the kernel.

## Authority Structure

| Layer | Function |
|-------|----------|
| **Mandate** | Immutable limits set by leadership, policy, or regulation. Enforced by canon immutability. AI processes cannot cross these boundaries regardless of context. |
| **Operational Oversight** | Interprets mandate in real time. Authorizes scopes, approves behaviors, issues overrides. The syscall gate enforces this for every write, deploy, and financial action. Capability tokens are issued, bounded, and revocable at this layer. |
| **Execution** | Where virtual employees, agents, and integrations act -- always within approved capability envelopes, always recorded in the event ledger, always attributable to the human who authorized the scope. |

## Design Principles

- **Governance beneath runtime:** Authority, observability, side-effect control, memory structure, and operator sovereignty are not features. They are invariants enforced beneath execution.
- **Structural enforcement:** Authority boundaries are enforced by architecture, not by prompts, policies, or behavioral guidelines.
- **Fail-safe by default:** The system fails toward human control, not toward continued autonomous execution. Revocation cascades ensure halt authority always outpaces the system's ability to act.
- **Constraint as stability:** Autonomy without constraint produces entropy. Learning without versioning produces corruption. Execution without structured memory produces repetition. Tool proliferation without substrate produces incoherence.
- **Designed for extension:** The syscall gate and capability model accommodate device-level authority grants, edge-local governance enforcement, and physical-world action mediation. The IoT extension layer is stubbed in the current architecture.

---

*Dominus OS is a product of [Dominus Foundry](https://dominusfoundry.com).*
