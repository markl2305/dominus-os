# Dominus OS — Conceptual Architecture

## Overview

Dominus OS is organized around a **governance plane** and an **execution plane**, connected by a **structured knowledge layer** and anchored by **observability**.

## Core Components

### Governance
Authority states, non-negotiable rules, and approvals for high-risk actions. The governance layer defines what can happen, under what constraints, and who must authorize it.

### Orchestrator
Routes objectives to agents and tools under scoped permissions. The orchestrator separates reasoning (planning what to do) from acting (executing in the world). Acting requires explicit authorization.

### Tooling
Adapters for communication, data, and operations — email, calendar, CRM, databases, web services, GitHub, and integrations. Each adapter operates within a governed envelope that limits scope and records side effects.

### Governed Business Workflows
Business-domain workflows (including CRM-class operations) integrated with the governance kernel. All record modifications and external actions pass through the same authority gates as every other system action. Automated operations handle enforcement, intelligence generation, and compliance under governed schedules.

### Operator Design System
A unified design language shared across desktop and mobile operator applications. The design system ensures the operator experience is consistent and structurally tied to the governance layer.

### Structured Knowledge Layer
A graph of versioned, typed objects — decisions, projects, doctrine, entities, tasks, and operational knowledge — connected by directional relationships. Every object carries provenance: who created it, when, how sourced, and whether human-verified or agent-generated. Three tiers: working memory (ephemeral task context), operational memory (persistent organizational knowledge), and archival memory (immutable historical record).

### Operator Assembly Surface
A structured editing environment for direct human interaction with the knowledge graph. Block-based editing with progressive typing: freeform drafts can be promoted to structured types (decisions, projects, doctrine) with required fields and lifecycle states. Familiar on the surface, structured underneath.

### Observability
Run logs, status indicators, and error surfacing that refuses to hide failure. Every run has a unique identity and timestamps. Failures surface immediately. Data freshness is measurable.

## Design Principles

- **Separation of reasoning and acting:** The system can plan without executing. Execution requires explicit authorization.
- **Structural enforcement:** Authority boundaries are enforced by architecture, not by prompts or behavioral guidelines.
- **Multi-tenant by design:** Tenant isolation is built into the architecture from the ground up.
- **Fail-safe by default:** The system fails toward human control, not toward continued autonomous execution.

## Authority Model

| Mode | Description |
|------|-------------|
| **Read-only** | No tool execution; suggestions and plans only |
| **Guarded** | Limited tool use with strict policy checks and approvals for risky actions |
| **Autonomous** | Broader execution within defined policies, still logged and revocable |

High-risk actions (external sending, destructive writes, privilege changes, public publishing) are approval-gated by default.

---

*Dominus OS is a product of [Dominus Foundry](https://dominusfoundry.com).*
