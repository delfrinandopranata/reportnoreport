# Phase 1 QA, round 2

Retest of round 1 at HEAD b1cd3e0 (backend 52730be, frontend b1cd3e0). Verdict: **PASS** (0 blocker, 0 major; 2 minor new, non-blocking).

## Check results

| Check | Result |
|---|---|
| `pnpm test` | pass, 8/8 |
| `pnpm lint` | pass, 0 warnings |
| `pnpm build` | pass |
| `deno test supabase/functions` | pass, 6/6 |
| `supabase db reset && supabase test db` | pass, 4 files / 47 tests |

## Round 1 findings, retested

| id | status | evidence |
|---|---|---|
| QA-1 | fixed | MemMgr (`members.manage` only) `remove_member(<Owner>)` -> 42501-style P0001 "Only an Owner can remove an Owner."; same user removing a non-Owner succeeds; an Owner removing another Owner (2 owners) succeeds; last Owner removing self -> "An organisation needs at least one Owner." |
| QA-2 | fixed | Owner signs out, viewer signs in, DOM polled every 10ms: Roles link never present, no stale rows, `rnr.orgId` cleared on sign-out; cache cleared on user change and queries keyed by user id. |
| QA-3 | fixed | After a successful invite the email field is empty, `:user-invalid` false, error text hidden. |
| QA-4 | fixed | Save sampled at 200/900/1500ms: "Saved" (aria-busy false); editor closed by 2200ms; "Role saved." shown. |
| QA-5 | fixed | `owner_count(<beta>)` and `require_permission` as authenticated -> 42501 permission denied. |
| QA-6 | fixed | `set_member_roles` with a null element and with duplicate ids -> "Invalid roles."; empty array still works. |
| QA-7 | fixed | `audit_log` now has `org.rename` (before/after name), `role.delete` with affected member ids, `member.accept` (in migration 4 and test file). Role-delete cascade is recorded in the one `role.delete` row. |
| QA-8 | fixed | After removing a member focus is on the Members h1 (`members-h`); a viewer on `#/roles` is redirected to `#/members`. |
| QA-9 | fixed | `pnpm lint` has no warnings (hook/context split into `useOrg.ts` + `OrgProvider.tsx`). |
| QA-10 | fixed | 3 rounds of 5 concurrent invites for one email: all 200, one `members` row each, one `member.invite` audit row each. |

## New findings

| id | severity | area | evidence | expected | actual | owner |
|---|---|---|---|---|---|---|
| QA-11 | minor | frontend | The new backend messages "Only an Owner can remove an Owner." (`remove_member`) and "Invalid roles." match no entry in `src/ui/errors.ts`; an Admin clicking Remove on an Owner row sees the generic "Something went wrong..." text. | Sentence mapped like the other guards (e.g. "Only an Owner can remove an Owner."), or hide Remove on Owner rows for non-Owners. | Generic fallback. | frontend |
| QA-12 | minor | frontend | `friendlyError`'s `inUse` / 23503 branch (`src/ui/errors.ts:19`) and the `inUse` option in `RolesPage.tsx:47` can never fire: `member_roles.role_id` cascades, so `delete_role` succeeds and the audit row lists the members. | No dead code; the unreachable "still assigned" copy removed. | Dead code only, no user-visible failure. The confirm dialog already warns "Members who hold it lose its permissions." | frontend |

## Notes

- Regression sweep over `15cb625...HEAD`: all round 1 probes (cross-org reads, direct writes, escalation, Owner-role edit/delete, removed-member calls, edge function cross-org / JWT / foreign role / Owner role) behave as before; UI sign-in, org create, invite, role create, Esc/backdrop dialogs unchanged.
- Dead-code judgement (item 3): not a defect, logged as minor QA-12.
- The local DB was reset again; probes left only invite rows for race@/r1-r3@alpha.test and a Counsellor role.

## Round 3

Retest of 282ede1. Final verdict: **PASS** (0 open findings).

| id | status | evidence |
|---|---|---|
| QA-11 | fixed | Fresh tab, admin@alpha.test: owner@alpha.test row has no Remove button, all non-Owner rows do. `errors.ts` maps "Only an Owner can remove an Owner." and "Invalid roles." ("Those roles are not valid for this organisation. Reload the page and try again."); `errors.test.ts` covers both plus fallback. Hiding is a UI hint only; the DB guard (round 2) still enforces. |
| QA-12 | fixed | `inUse`/23503 branch removed from `friendlyError` and `RolesPage`. |

Regression: owner@alpha.test removed r3@alpha.test through the dialog ("Member removed.", row gone, focus handling unchanged). Viewer path untouched by the diff (`can()` unchanged). `git diff b1cd3e0..282ede1` touches only errors.ts/test, MembersPage/MembersTable, RolesPage and the `userId` field added to OrgProvider/useOrg context (needed to find the caller's own member row; additive and safe). `pnpm test` 10/10, `pnpm lint` clean, `pnpm build` passes.
