# Dominus OS — Conceptual Architecture

## Overview

Dominus OS is organized around a **governance plane** and an **execution plane**, connected by **structured memory** and anchored by **observability**.

## Core Components

### Governance
Authority states, non-negotiable rules, and approvals for high-risk actions. The governance layer defines what can happen, under what constraints, and who must authorize it.

### Orchestrator
Routes objectives to agents and tools under scoped permissions. The orchestrator separates reasoning (planning what to do) from acting (executing in the world). Acting requires explicit authorization.

### Tooling
Adapters for communication, data, and operations — email, calendar, CRM, databases, web services, GitHub, and integrations. Each adapter operates within a governed envelope that limits scope and records side effects.

### Governed CRM
A purpose-built CRM integrated with the governance kernel. Lead management, composite scoring, email attribution, signal intelligence, and compliance truth-checking — all subject to the same authority gates as every other system action. Automated jobs handle lead scoring, follow-up enforcement, stale detection, and performance analytics under governed schedules.

### Forge Design System
A unified design language — typography tokens, color tokens, spacing, and component patterns — shared across macOS and iOS operator applications. Forge ensures the operator experience is consistent and structurally tied to the governance layer.

### Memory
Bounded session context plus durable knowledge, both with provenance. Memory writes include source, timestamp, and scope. The system distinguishes between agent-generated memory and human-verified knowledge.

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
