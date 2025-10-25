---
title: "Saga Pattern: Orchestration vs Choreography"
date: 2025-01-15
tags: ["distributed-systems", "architecture"]
---

When dealing with distributed transactions across microservices, the saga pattern provides a way to maintain data consistency without distributed locks. Two primary implementation approaches exist:

## Orchestration

A central coordinator manages the saga workflow. The orchestrator explicitly invokes each service and handles compensation logic if failures occur.

**Advantages:**
- Clear flow visualization
- Centralized error handling
- Easier to reason about state

**Tradeoffs:**
- Single point of coordination
- Orchestrator becomes a dependency

## Choreography

Services listen to events and trigger their own compensating transactions. No central coordinator.

**Advantages:**
- Loose coupling
- Natural scalability
- No single point of failure

**Tradeoffs:**
- Harder to track saga state
- Requires robust event infrastructure
- More complex debugging

For cross-region consistency requirements, I typically lean orchestration with regional coordinators to minimize latency while maintaining clear failure boundaries.