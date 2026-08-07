# ADR-0001: Modular monolith, not microservices

**Status:** Accepted · **Date:** 2026-08-07

## Context

`MISSION.md` calls for a platform "scalable to millions of users" with a "modular
architecture," and lists Kafka/RabbitMQ in the stack. That reads as an invitation to
start with microservices and a message broker.

We have zero users.

## Decision

Build a modular monolith. One deployable NestJS application with hard internal module
boundaries drawn along the seams we would eventually split: `identity`, `accounts`,
`transactions`, `categorization`, `budgets`, `insights`, `notifications`, `reports`.

Modules communicate through explicit service interfaces, never by reaching into each
other's tables. That constraint — not the deployment topology — is what "modular"
actually buys.

Defer Kafka. Postgres `LISTEN/NOTIFY` plus a jobs table covers async work until there
is a measured throughput problem.

## Consequences

**Good:** one thing to deploy, debug, and reason about. Transactions are actual
database transactions rather than sagas. A solo developer or small team can hold the
whole system in their head. Refactoring boundaries is cheap while we're still learning
where they belong — and at this stage we are certainly wrong about some of them.

**Bad:** one scaling unit. A hot categorization workload scales the whole app. We
accept this; vertical scaling and read replicas go a very long way.

**Migration path:** because modules already talk through interfaces and own their
tables, extracting one means replacing an in-process call with an HTTP or queue call.
That is a contained change, and we do it when a specific module's load justifies it —
not before.

## Alternatives rejected

- **Microservices from day one.** Buys distributed tracing, eventual consistency, and
  deployment orchestration. Sells nothing at our scale.
- **Serverless functions.** Cold starts fight the "startup under 2 seconds" and
  60 FPS goals, and connection pooling against Postgres becomes its own project.
