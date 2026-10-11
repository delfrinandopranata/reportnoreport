# Phase 2 QA, round 1

Scope: Phase 2 form builder, commits 7d122e1..13b57dc. Verdict: **PASS** (0 blocker, 0 major, 5 minor).

## Check results

| Check | Result |
|---|---|
| `pnpm test` | pass, 59/59 |
| `pnpm lint` | pass, 0 warnings |
| `pnpm build` | pass (500 kB chunk-size warning only) |
| `deno test supabase/functions` | pass, 50/50 |
| `supabase db reset && supabase test db` | pass, 5 files / 70 tests |

## Findings

| id | severity | area | evidence | expected | actual | owner |
|---|---|---|---|---|---|---|
| QA-P2-1 | minor | backend | `submit-form` with own-folder paths `<org>/<me>/<uuid>-nope.png` (never uploaded) and `<org>/<me>/..` for a `signature` field returns 200 and stores the path. | A stored file or signature path points at an object that exists in `form-files`. | `FILE_PATH` checks shape and prefix only; a submission can reference a missing file and the submissions view shows "We could not open this file". Not a cross-user leak. | backend |
| QA-P2-2 | minor | backend | Fields `c` (text), `a` (show_if c is "go"), `b` (required, show_if a is "x"); answers `{c:"no", a:"x"}` give `b: This field is required.` | A field hidden by `show_if` should not feed other rules. | `resolve` evaluates every `show_if` against answers before hidden ones are removed, so a hidden field's stale or smuggled value can make a dependent field visible and required. Browser and server agree (same module); no data leak. | backend |
| QA-P2-3 | minor | frontend | Submissions view as member: `Other reason` and `Medical certificate` render "Not answered" for fields that were hidden by `show_if` and never shown. Dates render as raw `2026-10-12`. | Hidden fields are omitted or marked "Not shown"; dates use the en-GB formatting used elsewhere. | Misleading "Not answered", unformatted dates. | frontend |
| QA-P2-4 | minor | frontend | Builder with unsaved edits, click Sign out: signed out at once, edits lost, no dialog (the nav guard covers hash changes only). | Same "Leave without saving?" protection, or accept as documented. | Silent loss of unsaved builder work on sign out. | frontend |
| QA-P2-5 | minor | frontend | `SubmissionsPage.tsx:26` signature `<img>` uses inline `background: '#fff'`; also a builder row for an unknown field type shows only "· Needs fixing" (empty name). | Tokens only (design/README); a fallback name for an unknown type. | Hard-coded colour; cosmetic blank row name on a corrupted schema. | frontend |

## Notes

- Defect classes from Phase 1 did not recur: forms are audited by trigger (`form.create/update/delete`); `storage_path_org` is not security definer; every new server message is mapped in `errors.ts` with a test (the form-delete message was verified in the real dialog); query keys carry the org or form id; forms delete and save report 0-row writes; focus returns to the heading after delete; CORS headers are right; no `shortcut:` without a limit (two present, both with an upgrade trigger).
- Security probes (REST with user JWTs and storage), all as expected:
  - Beta reads 0 alpha forms and 0 submissions. Beta insert is 403 (42501); update and delete affect 0 rows. Moving a form to another org is 42501 "Not allowed".
  - Member (no `forms.manage`) insert is 403; update and delete affect 0 rows. Owner and member direct inserts into `form_submissions` are 403.
  - `submit-form`: another org's form id gives 404; no JWT 401; malformed JWT 401 from the gateway; the anon key as JWT 401; malformed JSON, array body, non-uuid id and array answers give 400; a 2 MB body gives 413; GET gives 405.
  - Tampered `days:99` / `total:9999` are stored as 3 / 12.5; `other_reason`, `mc` and an unknown key are stripped.
  - A required field omitted gives 400 with a field error. Group rows beyond max give 400. Non-object rows, a 600-character short text and a 1e999 number give 400. A signature path from another user's folder gives 400 "Sign again.". `__proto__` and `constructor` answer keys are harmless.
  - Storage: a member reads their own file; admin and owner read it (`forms.manage`); viewer and beta get 404. Upload into another org or another user's folder is 403; overwrite and delete are 403; 11 MB gives 413; the public URL gives 400.
  - Deleting a form with submissions gives 409 and the dialog shows the mapped sentence. Two concurrent conditional updates on `updated_at`: one 200 with a row, the other 200 with `[]` (the UI reports it as a conflict).
- By design, not defects: a manager can write an invalid `schema` through REST (the table only checks `jsonb array`); `submit-form` then refuses it with 409 and the fill page shows "setup problem". Every active member, including Viewer, may submit and read the forms list.
- Expression parser and rule evaluator (ad-hoc script, same file under node 24 and deno): `a/b`, `1/0`, `constructor(1)`, `process.exit(1)`, `__proto__`, unknown functions, `**`, `%`, backticks, 500+ character input, 5,000 `-` signs, 60 nested brackets (null; 39 works), 1e308 overflow all give `null` and never throw. `g[].x` any-match, `g.count`, `t[].x` on text, null and empty rules, bogus operators, `is_one_of` with a non-array, a 100,000-character path and a throwing `toString` value all give `false` and never throw. Node and deno outputs are identical.
- UI (Claude Browser pane, fresh tab), done:
  - Builder as owner: added all 12 types, saved, and the stored schema has all 12 (selects get default options, group gets a child, calculated gets `0`). Keyboard-only reorder (Space, ArrowDown, Space) moved the field, kept focus on the handle, and announced the position.
  - Fill as member: Next page with empty required fields shows errors and focuses the first field. An 11 MB file gives "Choose a file under 10 MB."; a PDF uploads. Page 2 shows days = 3. Group rows stop at 3 with a notice; total 119.75. Signature Type and Signature Draw both saved and submitted, and the focus lands on the success heading.
  - Submissions as member: own rows only, file link and signature image load (signed URLs).
  - Viewer: no New/Edit/Delete, `#/forms/<id>/edit` redirects to fill.
  - Beta owner: forms empty state, and another org's form id shows "This form does not exist".
  - Esc closed the delete dialog and returned focus to the row's Delete button. 375px: no horizontal scroll on the list, fill or builder; the "Add a field" sheet opened full-width and Esc closed it. Viewport reset to desktop.
  - Console errors seen were only the expected 409 and a Phase 1 `logout?scope=global` 403 with a stale token.
- Not exercised in the UI: building rules and formulas through the builder forms (covered by unit tests plus a schema written to the DB), concurrent-edit conflict dialog (verified at REST level), and the owner's submissions list. Files over 800 lines: none.
- Test data left in the local DB: extra `form_submissions`, storage objects and form `c7535fdc-…` (invalid schema). `supabase db reset` clears it.

# Round 2

Retest at 9fa482a (backend 845aee9, frontend 9fa482a). Verdict: **PASS** (0 blocker, 0 major, 0 new findings).

| Check | Result |
|---|---|
| `pnpm test` | pass, 63/63 |
| `pnpm lint` | pass, 0 warnings |
| `pnpm build` | pass |
| `deno test supabase/functions` | pass, 54/54 |
| `supabase db reset && supabase test db` | pass, 5 files / 70 tests |

| id | status | evidence |
|---|---|---|
| QA-P2-1 | fixed | After uploading a real file, `submit-form` with that path returns 200; a never-uploaded own-folder path and `<org>/<me>/..` both return 400 "Sign again.". |
| QA-P2-2 | fixed | The cascade case (`c`, `a` hidden by c, `b` required if a is "x"; answers `{c:"no", a:"x"}`) now returns `ok` with only `c` stored. |
| QA-P2-3 | fixed | Owner's submissions view omits the hidden `Other reason` and `Medical certificate`; dates read "12 Oct 2026". |
| QA-P2-4 | fixed | With unsaved builder edits, Sign out and the organisation switch both open "Leave without saving?"; a real Esc cancels, keeps the session and the edit. |
| QA-P2-5 | fixed | The signature `<img>` no longer uses a hard-coded colour (only the canvas pixel fill `#fff` remains, which the PNG needs); `typeLabel` falls back to "Unknown field". |

## Regression sweep

- Parser and evaluator script, run on the same file under node 24 and deno: identical output, still no throw (hostile formulas give null, hostile rules false).
- Fill and submit with `show_if` (REST, real uploaded signature): a tampered `days:99` / `total:9999` is stored as 3 / 12.5; `other_reason`, `mc` and `evil` are stripped. Beta gets 404, no JWT 401, group over max, required omitted and bad number all still 400.
- Not re-run in the UI: the full fill flow (shared `resolve()` is covered by the REST and script checks above).
