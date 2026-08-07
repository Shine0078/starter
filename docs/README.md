# FINVERSE — Engineering Documentation

[`MISSION.md`](../MISSION.md) is the product brief. These documents translate it into
something buildable.

| Document | What it answers |
|---|---|
| [01-architecture.md](01-architecture.md) | How the system is shaped and why |
| [02-data-model.md](02-data-model.md) | What we store and how it relates |
| [03-security-privacy.md](03-security-privacy.md) | How we keep the privacy promise, and where it costs us |
| [04-roadmap.md](04-roadmap.md) | What gets built in what order, and what blocks it |
| [05-vertical-slice.md](05-vertical-slice.md) | The slice that exists in this repo today |
| [adr/](adr/) | Decisions with consequences, recorded |

## Reading order for a new engineer

1. `MISSION.md` — what we're building and for whom.
2. `01-architecture.md` — the shape of the system.
3. `05-vertical-slice.md` — the part that actually runs, and how to run it.
4. `adr/` — why things are the way they are before you propose changing them.

## Status

Phase 0. One vertical slice runs end to end against a mock aggregator:
**import → categorize → budget → insights → health score.** Nothing touches a real
bank. See [04-roadmap.md](04-roadmap.md) for what stands between here and a real one.
