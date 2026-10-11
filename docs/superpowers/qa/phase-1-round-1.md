# Phase 1 QA, round 1

Branch `feat/phase-1-foundation-rbac` (HEAD 15cb625). Verdict: **FAIL** (2 major, 8 minor, 0 blocker).

## Check results

| Check | Result |
|---|---|
| `pnpm test` | pass, 6/6 |
| `pnpm lint` | pass, 1 warning (QA-9) |
| `pnpm build` | pass |
| `deno test supabase/functions` | pass, 4/4 |
| `supabase db reset && supabase test db` | pass, 3 files / 35 tests |
| Adversarial SQL/REST probes (alpha owner/admin/member/viewer, beta owner, anon) | all RLS and RPC guards held except QA-1 |
| Edge function probes | dup invite -> `existing` same memberId (case-insensitive); cross-org 403; viewer 403; no/garbage JWT 401; foreign role 403; admin + Owner role 403; bad body 400 |
| UI (Browser pane, owner/admin/viewer; Esc, backdrop, keyboard, 375px) | works; QA-2, 3, 4, 8 found |

## Findings

| id | severity | area | evidence | expected | actual | owner |
|---|---|---|---|---|---|---|
| QA-1 | major | backend | Alpha owner promotes admin@ to Owner (2 owners). A user holding only `members.manage` (custom role "MemMgr", as member@) calls `select remove_member(<admin@ member id>)` -> `ok rows=1`, Owner deleted. `remove_member` (migration 20261012000003) checks only `members.manage` and the last-owner count. | Non-Owner cannot remove or demote an Owner, as `set_member_roles` already refuses ("Only an Owner can assign the Owner role."). | Any `members.manage` holder (including the seeded Admin) can remove an Owner whenever there are 2+ Owners. | backend |
| QA-2 | major | frontend | Sign out as owner, sign in as viewer in the same tab with a DOM probe at 20ms. t=81ms: `nav a[href="#/roles"]` present for the viewer (owner's cached permissions); settles false at t=121ms. `QueryClient` is created once in `src/main.tsx` and never cleared on sign out; `rnr.orgId` stays in localStorage. | Previous user's orgs, permissions, members and roles are never shown to the next user. | Cached data of the previous user renders until refetch completes, and stays if the refetch fails. | frontend |
| QA-3 | minor | frontend | UI: invite `ui-invite@alpha.test` succeeds ("Invite sent to…"), then the Email field turns red with "Enter a valid email address." `setEmail('')` on a required field after a user-edited value triggers `:user-invalid`. | Field returns to neutral after a successful invite. | Error state shown after success. | frontend |
| QA-4 | minor | frontend | `RolesPage.save()` awaits 1.6s inside `run()` and then unmounts the editor; `saved` is set only after `onSave` resolves. Probed: button reads "Saving…" for the whole delay. | "Saved" with check for 1.6s (designer spec §5). | "Saved" state never appears. | frontend |
| QA-5 | minor | backend | As alpha owner, `select owner_count('<beta org id>')` -> 1 (REST `/rpc/owner_count` too). `require_permission` also executable by `authenticated`. Both are SECURITY DEFINER with no membership check; migration only revokes from `public, anon`. | Helper functions not callable by clients, or scoped to the caller's orgs. | Any authenticated user learns the active Owner count of any org id. | backend |
| QA-6 | minor | backend | `set_member_roles(<member>, array[null::uuid])` -> raw `23502 null value in column "role_id"` (the null passes the `not in` check). Same via `save_role(..., p_permissions := '{null}')` path is guarded only by FK. | Validation error that maps to a friendly sentence. | Raw not-null error (UI shows the generic fallback). | backend |
| QA-7 | minor | backend | After `delete_role` of a role held by members, `audit_log` has only `role.delete`; `member_roles` cascade deletes write no per-member row. `accept_invites()` (invited -> active) and org rename (`orgs_update` policy) write no audit row. Also the UI `inUse` mapping (SQLSTATE 23503) can never fire because the FK cascades. | Every membership change audited (Global Constraints). | Gaps for role-delete cascade and invite acceptance; org rename unaudited. | backend |
| QA-8 | minor | frontend | Confirm "Remove member" -> after success `document.activeElement` is `BODY` (trigger row removed). Also a viewer opening `#/roles` sees the Members page with the URL still `#/roles`. | Focus lands somewhere sensible (e.g. page heading); URL redirects to `#/members`. | Focus lost; stale hash. | frontend |
| QA-9 | minor | frontend | `pnpm lint`: `src/rbac/useOrg.tsx:56` react(only-export-components) warning. | Clean lint. | 1 warning. | frontend |
| QA-10 | minor | backend | Code review of `invite-member/index.ts`: two concurrent first-time invites for one email both pass the `existing` check; the second hits `unique (org_id, email)` and returns 500 "Could not create the invite." instead of `existing`. Not reproduced live. | Second call returns `existing`. | 500. | backend |

## Notes

- Verified held: cross-org SELECT on orgs/members/roles/role_permissions/member_roles/audit_log returns 0 rows; direct INSERT/UPDATE/DELETE on all RBAC tables and audit_log denied or 0 rows; `audit()` denied to authenticated and anon; Owner role cannot be edited or deleted; escalation via `save_role`/`set_member_roles` refused; last-owner remove/demote refused; removed member gets 0 permissions and 42501 from RPCs; audit rows written for org.create, role.create/delete, member.roles, member.remove, member.invite.
- Edge function preflight `Access-Control-Allow-Headers` lists only authorization and content-type; the real browser invite worked, so not logged.
- Design check: no raw palette classes or hex in `src`; one primary per view (New role goes secondary while editor open); no file over 800 lines; Esc, backdrop and Cancel-first focus work; tab order logical; 375px has no page-level horizontal scroll.
- Local DB was reset several times; probes left only a pending `new@alpha.test` invite and the "Viewer Co" org in the current DB. Untracked `deno.lock` appeared after running deno tests.
