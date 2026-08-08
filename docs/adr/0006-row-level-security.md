# ADR-0006: Isolation is enforced by the database, not only by the queries

**Status:** Accepted · **Date:** 2026-08-08

## Context

Every store method takes a `userId` and every statement filters on it, and there are
tests that attempt cross-user reads and writes and are refused. That is a real control,
and it has one property that should worry anyone shipping a finance product: it holds
only as long as every query, forever, remembers its `WHERE user_id = $1`.

The failure mode of forgetting is the bad kind. Nothing throws. The endpoint returns
200 with somebody else's transactions in it, and the first person to notice is a user
looking at a stranger's rent payment.

PostgreSQL row-level security moves that check underneath the query, where forgetting
is not possible. The reason it was not simply switched on with the auth work is that
three prerequisites each fail *open* — get one wrong and the policies exist, apply to
nothing, and every test written to prove isolation passes against nothing at all.

## Decision

**Row-level security on the four user-owned tables, with the application connecting as
a role that cannot bypass it.** Three parts, all of which are load-bearing.

### 1. Two database identities

`DATABASE_URL` is the schema owner. It runs migrations and creates the runtime role,
and does nothing else. On docker-compose, on the embedded harness, and on most managed
providers it is a superuser — and **a superuser bypasses every policy silently**, which
is precisely why it must not be the connection serving requests.

`DATABASE_APP_URL` is that connection: `finverse_app`, explicitly `NOSUPERUSER` and
`NOBYPASSRLS`, granted DML on the data tables and nothing else. No `CREATE` on the
schema, so it cannot shadow the function the policies call. No write on
`schema_migrations`, so it cannot convince the next deploy that a migration already ran.

The role is created from the credentials in `DATABASE_APP_URL` itself, as part of the
migration step, so the two cannot drift apart and a rotated password re-syncs on the
next deploy rather than locking the app out.

Leaving `DATABASE_APP_URL` unset is supported and the API runs — it just logs, on every
boot, that it is serving as the owner and that isolation therefore rests on application
code alone. Silence there would be the worst possible outcome.

### 2. The current user is transaction-scoped

Policies compare `user_id` against `current_setting('finverse.user_id')`, which
something must set. It is set with `set_config(..., true)` — transaction-local — which
means **every store call is now a transaction**, via `withUserScope` in
`infra/postgres/pool.ts`.

Session-local would have been cheaper and is a latent data leak: a pooled connection is
handed to the next request the moment this one finishes, and the scope would go with it.
That bug leaks sporadically and only under load, which is the hardest kind to find.

### 3. `FORCE`, not just `ENABLE`

`ENABLE ROW LEVEL SECURITY` exempts the table owner. With only that, anything connecting
as the owner — a migration, a psql session, the test harness — sees every row, and the
contract suite would pass identically against a database with no policies on it.

## Consequences

**Good:** a missing `WHERE` clause now returns nothing instead of everything. The two
controls are independent — a policy and a predicate both have to be wrong before one
user sees another's money — and the explicit filters stay for exactly that reason.
`ALTER DEFAULT PRIVILEGES` covers tables added by later migrations without anyone
remembering to come back.

**Bad:** every store call costs a `BEGIN`/`COMMIT` round trip it did not before, and a
query that legitimately spans users (an admin report, an analytics job) cannot be
written against this connection at all. Both are accepted. On the first, correctness
outranks latency in this codebase; on the second, a cross-user query in the request path
is the thing being prevented, and anything that genuinely needs one can connect as the
owner deliberately.

**The tables left out are left out on purpose.** `users`, `sessions` and `auth_events`
are read *before* there is a user to scope to — login, refresh, lockout counting — so
they cannot carry a policy keyed on identity. They stay under application control by
necessity, and `users` being readable by the app role is a real, accepted limit of this
design rather than an oversight.

**The tests must be able to fail.** `test/rls.spec.ts` asserts the preconditions
directly — that the role is not a superuser, that it holds no `BYPASSRLS`, that every
table is both enabled and forced — because each of those failing open would leave the
rest of the suite passing against nothing. It then issues the unfiltered statements no
store would ever write (`SELECT * FROM transactions`, `DELETE FROM budgets`) and asserts
the database withholds the rows on its own. Disabling the policies fails 16 of its 21
tests; that was verified, not assumed.

## Alternatives rejected

- **Application filtering alone.** What we had. One forgotten predicate away from a
  breach, with no second line and no noise when it happens.
- **A separate schema or database per user.** Genuine isolation, and it makes migrations
  O(users), connection pooling unworkable, and any cross-user analytics impossible. It is
  the right answer at a much smaller number of much larger tenants.
- **A session-level `SET` instead of `SET LOCAL`.** Cheaper, and it leaks one user's
  scope into whichever request gets that pooled connection next. See above.
- **Policies naming the application role explicitly** (`TO finverse_app`). Rejected in
  favour of role-agnostic policies plus `FORCE`: naming the role means anyone who
  connects as anything else is exempt, which is the failure mode being designed out.
