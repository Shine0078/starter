# FINVERSE — Engineering Documentation

[`MISSION.md`](../MISSION.md) is the product brief. These documents translate it into
something buildable.

**Resuming work after a break?** Start at
[07-session-notes.md](07-session-notes.md) — current state, the next task, and
the traps that cost time to rediscover.

| Document | What it answers |
|---|---|
| [01-architecture.md](01-architecture.md) | How the system is shaped and why |
| [02-data-model.md](02-data-model.md) | What we store and how it relates |
| [03-security-privacy.md](03-security-privacy.md) | Which controls exist, which do not, and where privacy costs us |
| [04-roadmap.md](04-roadmap.md) | What gets built in what order, and what blocks it |
| [05-vertical-slice.md](05-vertical-slice.md) | The slice that exists in this repo today |
| [06-cheap-launch-path.md](06-cheap-launch-path.md) | The lowest-cost route to a personal beta |
| [07-session-notes.md](07-session-notes.md) | Where work stopped and how to pick it up |
| [adr/](adr/) | Decisions with consequences, recorded |

## Reading order for a new engineer

1. `MISSION.md` — what we're building and for whom.
2. `01-architecture.md` — the shape of the system.
3. `05-vertical-slice.md` — the part that actually runs, and how to run it.
4. `adr/` — why things are the way they are before you propose changing them.

## Status

Phase 1, partway. Authentication is real: Argon2id, rotating refresh tokens with
reuse detection, a globally registered guard, per-account lockout, and cross-user
regression tests. Persistence is Postgres behind ports, with a contract suite run
against both adapters.

The aggregator is still a mock — no bank has been connected, and connecting one
is gated on a commercial agreement rather than on code. Row-level security is the
next task; see [04-roadmap.md](04-roadmap.md) for why it is not a one-line
migration.
