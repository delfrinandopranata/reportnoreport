# Phase 2 — Form Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin with `forms.manage` builds a form from all 12 field types (drag to reorder, live preview), and any member of the org fills it in page by page and submits it; the server revalidates every answer and recomputes every calculated value, and submissions are listed per form — before workflows exist.

**Architecture:** One pure TypeScript module, `supabase/functions/_shared/forms/`, holds the rule evaluator, the formula parser, schema validation and answer validation. It has no Node-, Deno- or browser-specific imports, so Vite imports it (through `src/forms/logic.ts`) and the `submit-form` Edge Function imports it directly; its tests run under both `node --test` and `deno test`. Postgres holds `forms` (RLS: members read, `forms.manage` writes, audited by trigger) and `form_submissions` (no client write policy: only `submit-form`, with the service role, after validating). Files and signatures go to the private `form-files` Storage bucket under `<org_id>/<user_id>/…`, enforced by storage RLS.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, supabase-js 2, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new, Task 8 only), Supabase CLI (Postgres 17, pgTAP, Storage), Deno 2 Edge Functions, `node --test`, oxlint.

**Spec:** `docs/superpowers/specs/2026-10-11-reportnoreport-v2-design.md` (§4 Forms, §10 Error handling, §11 Testing, §12 phase 2, §15 Design system)

## Global Constraints

- Everything from Phase 1's Global Constraints still holds (org-scoped tables, `has_permission()` in every policy, British English, sentence-case verb-first buttons, no emoji, `design/` authoritative, tokens only, one `rnr-btn-primary` per view, never `disabled` on submit, `aria-busy` + `rnr-spin` while saving, native `<dialog>` via `src/ui/ConfirmDialog.tsx`).
- **The browser is never trusted** for validation, calculated values or permissions (§10). The Edge Function runs the same shared module and its result is the one stored; the client's calculated values and hidden-field answers are discarded.
- **No `eval`, `Function`, or dynamic import** anywhere in formula or rule handling. The evaluator and calculator never throw: an unreadable value makes a rule `false` and a formula `null`.
- **Shared module rules:** files under `supabase/functions/_shared/forms/` import only each other, always with the `.ts` extension; no `Deno.*`, `process`, `window`, `document`, npm or jsr imports; erasable TypeScript only (no enums, no parameter properties). Tests in that folder use `node:test` + `node:assert/strict` so the same files run under `node --test` and `deno test`.
- **Dates are UTC days** (`YYYY-MM-DD`), so `within_days` and `days_between` give the same answer in the browser and on the server.
- `forms.schema` is a JSON array of fields (spec §4.1 "an ordered list of fields"). Field keys match `^[a-z][a-z0-9_]{0,39}$` and are unique among their siblings. A repeating section (`group`) may hold only the nine input types; no `page_break`, nested `group` or `calculated` inside it. A `calculated` field may reference only fields above it.
- Who may submit in Phase 2: any active member of the form's org (the `forms_read` policy). Phase 3 narrows starting a record with `workflow_access`. `form_submissions` becomes Phase 3's `submissions` (rename + `record_id`, `node_id`, `outcome` added there); do not add those columns now.
- A form with submissions cannot be deleted (FK `restrict`); the UI says so. No cascade silently destroys answers.
- Uploads: private bucket `form-files`, 10 MB per file, path `<org_id>/<user_id>/<uuid>-<safe name>`. A user writes only under their own folder in an org they belong to; reads are their own files or, with `forms.manage`, the org's.
- **Defect classes from Phase 1 QA that must not recur:**
  - every client-visible write is audited (QA-7) — forms by trigger;
  - no `security definer` helper is callable by clients unless it is meant to be (QA-5) — `storage_path_org` is plain `sql immutable`, not definer;
  - every new server message has an entry in `src/ui/errors.ts` with a test, and no unreachable error branch is added (QA-11, QA-12);
  - TanStack Query keys always include `orgId` (or the form id) and two queries with different `select` shapes never share a key (QA-2);
  - a write that RLS turns into 0 rows is reported, never silent (forms delete and save use `.select()` and check the length);
  - focus moves to the page heading after the row that triggered an action disappears (QA-8);
  - Edge Function CORS allows `authorization, x-client-info, apikey, content-type` (QA notes);
  - concurrent edits are detected, not lost: form save is conditional on `updated_at` (QA-10 class).
- New dependencies: only `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- The Senior Designer's `docs/superpowers/design/phase-2-screens.md` (Task 5) is written before Tasks 6–9. Where it differs from the code in this plan on a visual, copy or accessibility point, the design spec wins; behaviour, data and security stay as this plan says.

## Review Focus

1. **A client sends a tampered calculated value** (`total: 9999`, `days: 99`) → the stored submission holds the server's recomputed values (`12.5`, `3`). (test "recomputes calculated values and discards client values" in Task 4)
2. **A required field is hidden by `show_if`** → it is not required, and an answer smuggled into it is stripped before storage; once its rule is met it becomes required. (test "a hidden required field is not required, and its answer is stripped" in Task 2)
3. **A member without `forms.manage`, or a user from another org, writes `forms` through REST or inserts `form_submissions` directly** → RLS denies (42501 or 0 rows), and beta reads zero alpha forms. (`05_forms.test.sql` in Task 3)
4. **Someone uploads into another user's or org's folder, or submits a file path from another user's folder** → storage RLS raises 42501, and `submit-form` answers 400 "Sign again." / "Upload the file again." (`05_forms.test.sql` in Task 3; test "rejects a file from another user's folder" in Task 4)
5. **A hostile or broken formula or rule** (`constructor(1)`, `process.exit(1)`, 60 nested brackets, `status[].x` on a text answer, `null` rule) → `null` / `false`, never a throw, never evaluated as code, identical under node and deno. (tests "unreadable values are false and never throw" and "never evaluates code" in Task 1)

---

## Owners and order

| Task | Owner | Depends on |
|---|---|---|
| 1. Shared: rule evaluator + formula parser | Backend engineer | — |
| 2. Shared: schema and answer validation | Backend engineer | 1 |
| 3. Database: forms, submissions, storage | Backend engineer | — (parallel with 1–2) |
| 4. Edge Function `submit-form` | Backend engineer | 2, 3 |
| 5. Design spec `phase-2-screens.md` | Senior Designer | — (parallel with 1–4) |
| 6. Frontend: routes, nav, forms list | Frontend engineer | 1, 3, 5 |
| 7. Frontend: form runner, uploads, fill page | Frontend engineer | 2, 6 (live submit needs 4) |
| 8. Frontend: builder with drag-to-reorder | Frontend engineer | 7 |
| 9. Frontend: submissions page + end-to-end check | Frontend engineer | 4, 7 |

Backend runs 1 → 2 → 4 with 3 alongside; the designer runs 5 at the same time; the frontend engineer starts 6 once 1, 3 and 5 are committed.

---

## File Structure

```
supabase/functions/_shared/forms/types.ts        FIELD_TYPES, OPERATORS, Field, Rule, Answers
supabase/functions/_shared/forms/rules.ts        toDay, isEmpty, parsePath, readPath, evaluate
supabase/functions/_shared/forms/expr.ts         compile, calculate (hand-written parser)
supabase/functions/_shared/forms/schema.ts       KEY_RE, SECTION_FIELD_TYPES, validateSchema
supabase/functions/_shared/forms/answers.ts      pages, resolve, visiblePages, validateAnswers
supabase/functions/_shared/forms/index.ts        barrel
supabase/functions/_shared/forms/fixture.ts      FORM (all 12 types), VALID, ORG, USER, PREFIX — tests only
supabase/functions/_shared/forms/rules.test.ts
supabase/functions/_shared/forms/expr.test.ts
supabase/functions/_shared/forms/schema.test.ts
supabase/functions/_shared/forms/answers.test.ts
supabase/migrations/20261013000001_forms.sql     forms, form_submissions, RLS, triggers, form-files bucket + policies
supabase/tests/05_forms.test.sql
supabase/seed.sql                                + seeded "Leave request" form
supabase/functions/submit-form/handler.ts        pure handler, dependencies injected
supabase/functions/submit-form/handler.test.ts
supabase/functions/submit-form/index.ts          Deno.serve wiring
docs/superpowers/design/phase-2-screens.md       designer spec (Task 5)
src/forms/logic.ts                               re-exports the shared module for Vite
src/forms/api.ts                                 useForms, useForm, submitAnswers, FormRow, LoadedForm
src/forms/FormGate.tsx                           loading / error / not-found wrapper
src/forms/FormsPage.tsx                          list, create, delete
src/forms/paths.ts                               filePath (pure)
src/forms/paths.test.ts
src/forms/upload.ts                              uploadFile, uploadMessage, FILE_BUCKET
src/forms/fill/FieldInput.tsx                    one input per field type
src/forms/fill/FileInput.tsx
src/forms/fill/SignaturePad.tsx
src/forms/fill/FormRenderer.tsx                  a page of fields, incl. repeating sections
src/forms/fill/FormRunner.tsx                    paging, per-page validation, submit (fill + preview)
src/forms/fill/FillPage.tsx
src/forms/builder/builderOps.ts                  TYPE_LABELS, newField, move, rulePaths, valueText, parseValue
src/forms/builder/builderOps.test.ts
src/forms/builder/DraftInput.tsx                 commit-on-blur text input
src/forms/builder/FieldList.tsx                  dnd-kit sortable list + AddField
src/forms/builder/RuleEditor.tsx                 show_if editor
src/forms/builder/FieldSettings.tsx
src/forms/builder/FormBuilder.tsx
src/forms/submissions/SubmissionsPage.tsx
src/rbac/route.ts, src/rbac/route.test.ts        parseRoute + guardHash for form pages
src/ui/errors.ts, src/ui/errors.test.ts          form messages
src/ui/icons.tsx                                 + Plus, Trash, Grip, Up, Down, Upload, File
src/App.tsx                                      Forms nav + route switch
src/index.css                                    selected block state
package.json                                     test glob; dnd-kit (Task 8)
README.md                                        submit-form, form tests
```

---

### Task 1: Shared rule evaluator and formula parser

**Owner:** Backend engineer · **Depends on:** —

**Files:**
- Create: `supabase/functions/_shared/forms/types.ts`, `rules.ts`, `expr.ts`, `index.ts`
- Test: `supabase/functions/_shared/forms/rules.test.ts`, `expr.test.ts`
- Modify: `package.json` (test glob)

**Interfaces:**
- Produces:
  - `type FieldType`, `FIELD_TYPES: readonly FieldType[]`, `type Operator`, `OPERATORS: readonly Operator[]`
  - `type Rule = { field: string; operator: Operator; value?: unknown }`
  - `type Field = { key: string; type: FieldType; label: string; help?: string; required?: boolean; options?: string[]; show_if?: Rule; fields?: Field[]; repeat?: { min: number; max: number }; expression?: string }`
  - `type Answers = Record<string, unknown>`
  - `toDay(v: unknown): number | null` · `todayOf(now: Date): number` · `isEmpty(v: unknown): boolean`
  - `parsePath(path: unknown): { root: string; col?: string; count: boolean } | null`
  - `readPath(answers: Answers, path: string): unknown[] | null`
  - `evaluate(rule: Rule, answers: Answers, now?: Date): boolean`
  - `compile(src: string): { ok: true; ast: Node; refs: { key: string; col?: string }[] } | { ok: false; error: string }`
  - `calculate(expression: string, answers: Answers): number | null`

- [ ] **Step 1: Point the unit test script at the shared folder** — `package.json`

```json
"test": "node --test 'src/**/*.test.ts' 'supabase/functions/_shared/**/*.test.ts'",
```

- [ ] **Step 2: Write the types** — `supabase/functions/_shared/forms/types.ts`

```ts
export const FIELD_TYPES = [
  'short_text', 'long_text', 'number', 'date', 'single_select', 'multi_select', 'checkbox',
  'file', 'signature', 'page_break', 'group', 'calculated',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const OPERATORS = ['is', 'is_not', 'is_one_of', 'contains', 'is_empty', 'is_not_empty', 'gt', 'lt', 'within_days'] as const
export type Operator = (typeof OPERATORS)[number]

export type Rule = { field: string; operator: Operator; value?: unknown }

export type Field = {
  key: string
  type: FieldType
  label: string
  help?: string
  required?: boolean
  options?: string[]
  show_if?: Rule
  fields?: Field[]
  repeat?: { min: number; max: number }
  expression?: string
}

export type Answers = Record<string, unknown>
```

- [ ] **Step 3: Write the failing rule tests** — `supabase/functions/_shared/forms/rules.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, readPath, toDay } from './rules.ts'
import type { Rule } from './types.ts'

const now = new Date('2026-10-11T12:00:00Z')
const a = {
  status: 'approved', age: 17, tags: ['art', 'music'], note: 'Needs Bus pass', dob: '2026-10-01', empty: '',
  family: [{ relation: 'mother', age: 40 }, { relation: 'brother', age: 9 }],
}
const ev = (field: string, operator: string, value?: unknown, answers: Record<string, unknown> = a) =>
  evaluate({ field, operator, value } as Rule, answers, now)

test('is / is_not compare scalars as text', () => {
  assert.equal(ev('status', 'is', 'approved'), true)
  assert.equal(ev('age', 'is', '17'), true)
  assert.equal(ev('status', 'is_not', 'approved'), false)
  assert.equal(ev('missing', 'is_not', 'x'), true)
  assert.equal(ev('flag', 'is', true, { flag: true }), true)
})
test('is_one_of over a scalar and over a list answer', () => {
  assert.equal(ev('status', 'is_one_of', ['draft', 'approved']), true)
  assert.equal(ev('tags', 'is_one_of', ['music']), true)
  assert.equal(ev('tags', 'is_one_of', ['sport']), false)
})
test('contains is case-insensitive on text and exact on lists', () => {
  assert.equal(ev('note', 'contains', 'bus'), true)
  assert.equal(ev('tags', 'contains', 'art'), true)
  assert.equal(ev('tags', 'contains', 'ar'), false)
  assert.equal(ev('note', 'contains', ''), false)
})
test('is_empty / is_not_empty', () => {
  assert.equal(ev('empty', 'is_empty'), true)
  assert.equal(ev('missing', 'is_empty'), true)
  assert.equal(ev('x', 'is_empty', undefined, { x: [] }), true)
  assert.equal(ev('x', 'is_empty', undefined, { x: false }), true)
  assert.equal(ev('tags', 'is_not_empty'), true)
})
test('gt / lt on numbers and dates', () => {
  assert.equal(ev('age', 'gt', 16), true)
  assert.equal(ev('age', 'lt', '18'), true)
  assert.equal(ev('dob', 'gt', '2026-09-30'), true)
  assert.equal(ev('dob', 'lt', '2026-09-30'), false)
})
test('within_days counts whole UTC days either side of today', () => {
  assert.equal(ev('dob', 'within_days', 10), true)
  assert.equal(ev('dob', 'within_days', 9), false)
  assert.equal(ev('d', 'within_days', 10, { d: '2026-10-21' }), true)
  assert.equal(ev('dob', 'within_days', -1), false)
})
test('group[].field matches when any row matches', () => {
  assert.equal(ev('family[].relation', 'is', 'brother'), true)
  assert.equal(ev('family[].age', 'gt', 50), false)
  assert.equal(ev('nobody[].relation', 'is_empty'), false)
})
test('group.count', () => {
  assert.equal(ev('family.count', 'is', 2), true)
  assert.equal(ev('family.count', 'gt', 1), true)
  assert.equal(ev('nobody.count', 'is', 0), true)
})
test('unreadable values are false and never throw', () => {
  const results = [
    ev('status[].x', 'is', 'a'),
    ev('family.count.x', 'is', 1),
    ev('', 'is', ''),
    ev('age', 'gt', 'abc'),
    ev('dob', 'within_days', 'x'),
    ev('status', 'is_one_of', 'approved'),
    ev('status', 'is', 'approved', null as never),
    ev('family[].relation', 'is', 'mother', { family: [1, 2] }),
    evaluate(null as never, a, now),
    evaluate({ field: 'status', operator: 'nope' } as never, a, now),
  ]
  assert.deepEqual(results, results.map(() => false))
})
test('readPath and toDay', () => {
  assert.deepEqual(readPath(a, 'family[].relation'), ['mother', 'brother'])
  assert.equal(readPath(a, 'status[].x'), null)
  assert.equal(toDay('2026-02-30'), null)
  assert.equal(toDay('2026-2-1'), null)
  assert.equal(typeof toDay('2026-10-11'), 'number')
})
```

- [ ] **Step 4: Write the failing formula tests** — `supabase/functions/_shared/forms/expr.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculate, compile } from './expr.ts'

const calc = (e: string, answers: Record<string, unknown> = {}) => calculate(e, answers)

test('arithmetic precedence and parentheses', () => {
  assert.equal(calc('1 + 2 * 3'), 7)
  assert.equal(calc('(1 + 2) * 3'), 9)
  assert.equal(calc('10 - 4 - 3'), 3)
  assert.equal(calc('8 / 4 / 2'), 1)
  assert.equal(calc('-2 * -3'), 6)
})
test('× ÷ − work like * / -', () => {
  assert.equal(calc('6 × 2 ÷ 3 − 1'), 3)
})
test('field references', () => {
  assert.equal(calc('price * qty', { price: 2.5, qty: 4 }), 10)
  assert.equal(calc('a + 1'), null)
  assert.equal(calc('flag + 1', { flag: true }), 2)
})
test('aggregates over repeating-section columns', () => {
  const ans = { items: [{ amount: 5 }, { amount: 7 }, { amount: '' }], tags: ['a', 'b'] }
  assert.equal(calc('sum(items[].amount)', ans), 12)
  assert.equal(calc('count(items)', ans), 3)
  assert.equal(calc('count(items[].amount)', ans), 2)
  assert.equal(calc('min(items[].amount)', ans), 5)
  assert.equal(calc('max(items[].amount, 9)', ans), 9)
  assert.equal(calc('sum(1, 2, 3)'), 6)
  assert.equal(calc('count(tags)', ans), 2)
  assert.equal(calc('sum(none[].x)'), 0)
  assert.equal(calc('min(none[].x)'), null)
})
test('days_between and round', () => {
  assert.equal(calc('days_between(start, end)', { start: '2026-10-01', end: '2026-10-11' }), 10)
  assert.equal(calc('days_between(start, nope)', { start: '2026-10-01' }), null)
  assert.equal(calc('round(10 / 3, 2)'), 3.33)
  assert.equal(calc('round(2.5)'), 3)
  assert.equal(calc('round(1, 11)'), null)
})
test('if with comparisons', () => {
  assert.equal(calc('if(age >= 18, 1, 0)', { age: 18 }), 1)
  assert.equal(calc('if(age >= 18, 1, 0)', { age: 17 }), 0)
  assert.equal(calc('if(1 > 2, 1, 2)'), 2)
  assert.equal(calc('if(end > start, days_between(start, end), 0)', { start: '2026-10-01', end: '2026-10-03' }), 2)
  assert.equal(calc('if(a = 3, 10, 20)', { a: 3 }), 10)
})
test('division by zero and non-numbers give null', () => {
  assert.equal(calc('1 / 0'), null)
  assert.equal(calc('name * 2', { name: 'x' }), null)
})
test('compile reports errors in plain words', () => {
  const cases: [string, RegExp][] = [
    ['', /Enter a formula/],
    ['1 +', /ends too early/],
    ['(1 + 2', /Expected "\)" at position 7/],
    ['foo(1)', /Unknown function "foo"/],
    ['constructor(1)', /Unknown function "constructor"/],
    ['round(1, 2, 3)', /"round" takes 1 to 2 values/],
    ['1 $ 2', /Unexpected "\$" at position 3/],
    ['1 2', /Unexpected "2"/],
    ['('.repeat(60) + '1' + ')'.repeat(60), /nested too deeply/],
    ['1'.repeat(501), /under 500 characters/],
  ]
  for (const [src, msg] of cases) {
    const c = compile(src)
    assert.equal(c.ok, false, src)
    if (!c.ok) assert.match(c.error, msg)
  }
})
test('compile lists the fields a formula reads', () => {
  const c = compile('sum(items[].amount) + fee')
  assert.ok(c.ok)
  if (c.ok) assert.deepEqual(c.refs, [{ key: 'items', col: 'amount' }, { key: 'fee' }])
})
test('never evaluates code', () => {
  assert.equal(calculate('process.exit(1)', {}), null)
  assert.equal(calculate('constructor', {}), null)
  assert.equal(calculate('__proto__ + 1', {}), null)
})
```

- [ ] **Step 5: Run — expect FAIL**

Run: `pnpm test`
Expected: `Cannot find module '…/rules.ts'` and `'…/expr.ts'`.

- [ ] **Step 6: Implement the evaluator** — `supabase/functions/_shared/forms/rules.ts`

```ts
import { OPERATORS, type Answers, type Operator, type Rule } from './types.ts'

const KEY = '[a-z][a-z0-9_]{0,39}'
const PATH = new RegExp(`^(${KEY})(?:\\[\\]\\.(${KEY})|\\.(count))?$`)
const DAY_MS = 86_400_000

/** Days since 1970-01-01 for a real YYYY-MM-DD date, else null. */
export function toDay(v: unknown): number | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  const back = new Date(t)
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? t / DAY_MS : null
}

/** Today as a UTC day number, so browser and server agree. */
export const todayOf = (now: Date) => Math.floor(now.getTime() / DAY_MS)

export function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === false ||
    (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
}

export function parsePath(path: unknown): { root: string; col?: string; count: boolean } | null {
  const m = typeof path === 'string' ? PATH.exec(path) : null
  return m ? { root: m[1], col: m[2], count: !!m[3] } : null
}

/** Candidate values for a path (several for `group[].field`), or null when it cannot be read. */
export function readPath(answers: Answers, path: string): unknown[] | null {
  const p = parsePath(path)
  if (!p || !answers || typeof answers !== 'object') return null
  const v = Object.hasOwn(answers, p.root) ? answers[p.root] : undefined
  if (!p.col && !p.count) return [v]
  if (v === undefined || v === null) return p.count ? [0] : []
  if (!Array.isArray(v)) return null
  if (p.count) return [v.length]
  if (v.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) return null
  const col = p.col as string
  return v.map((r) => (Object.hasOwn(r, col) ? (r as Answers)[col] : undefined))
}

const isScalar = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
const same = (a: unknown, b: unknown) => isScalar(a) && isScalar(b) && String(a) === String(b)
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)

function compare(v: unknown, target: unknown): number | null {
  const a = num(v)
  const b = num(target)
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b
  const da = toDay(v)
  const db = toDay(target)
  return da !== null && db !== null ? da - db : null
}

function check(op: Operator, v: unknown, target: unknown, now: Date): boolean {
  switch (op) {
    case 'is_empty': return isEmpty(v)
    case 'is_not_empty': return !isEmpty(v)
    case 'is': return same(v, target)
    case 'is_not': return !same(v, target)
    case 'is_one_of':
      if (!Array.isArray(target)) return false
      return Array.isArray(v) ? v.some((x) => target.some((t) => same(x, t))) : target.some((t) => same(v, t))
    case 'contains':
      if (Array.isArray(v)) return v.some((x) => same(x, target))
      return typeof v === 'string' && typeof target === 'string' && target !== '' &&
        v.toLowerCase().includes(target.toLowerCase())
    case 'gt': { const c = compare(v, target); return c !== null && c > 0 }
    case 'lt': { const c = compare(v, target); return c !== null && c < 0 }
    case 'within_days': {
      const d = toDay(v)
      const n = num(target)
      return d !== null && Number.isFinite(n) && n >= 0 && Math.abs(d - todayOf(now)) <= n
    }
  }
}

/** The one evaluator for show_if, Condition cards, report filters and audiences (spec §4.3). */
export function evaluate(rule: Rule, answers: Answers, now: Date = new Date()): boolean {
  try {
    if (!rule || typeof rule !== 'object' || !(OPERATORS as readonly string[]).includes(rule.operator)) return false
    const values = readPath(answers, rule.field)
    return values !== null && values.some((v) => check(rule.operator, v, rule.value, now))
  } catch {
    return false // spec §4.3: an unreadable value makes a rule false, never throws
  }
}
```

- [ ] **Step 7: Implement the parser** — `supabase/functions/_shared/forms/expr.ts`

```ts
import type { Answers } from './types.ts'
import { toDay } from './rules.ts'

export type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; key: string; col?: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] }

export type Ref = { key: string; col?: string }
export type Compiled = { ok: true; ast: Node; refs: Ref[] } | { ok: false; error: string }

const ARITY: Record<string, [number, number]> = {
  sum: [1, 50], count: [1, 50], min: [1, 50], max: [1, 50], days_between: [2, 2], round: [1, 2], if: [3, 3],
}
const SYMBOLS: Record<string, string> = { '×': '*', '÷': '/', '−': '-' }
const MAX_DEPTH = 40
type Tok = { k: 'num' | 'id' | 'op' | 'end'; v: string; at: number }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    if (/^\s/.test(rest)) { i++; continue }
    const m = /^(\d+(?:\.\d+)?|\.\d+)/.exec(rest) ??
      /^[a-z][a-z0-9_]*(?:\[\]\.[a-z][a-z0-9_]*)?/.exec(rest) ??
      /^(>=|<=|!=|[-+*/()<>=,])/.exec(rest)
    if (m) {
      const k = /^[\d.]/.test(m[0]) ? 'num' : /^[a-z]/.test(m[0]) ? 'id' : 'op'
      out.push({ k, v: m[0], at: i })
      i += m[0].length
      continue
    }
    if (Object.hasOwn(SYMBOLS, src[i])) { out.push({ k: 'op', v: SYMBOLS[src[i]], at: i }); i++; continue }
    throw new Error(`Unexpected "${src[i]}" at position ${i + 1}.`)
  }
  out.push({ k: 'end', v: '', at: src.length })
  return out
}

function parse(toks: Tok[]): Node {
  let p = 0
  let depth = 0
  const isOp = (...vs: string[]) => toks[p].k === 'op' && vs.includes(toks[p].v)
  const unexpected = (t: Tok) => new Error(t.k === 'end' ? 'The formula ends too early.' : `Unexpected "${t.v}" at position ${t.at + 1}.`)
  const eat = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}" at position ${toks[p].at + 1}.`)
    p++
  }
  function expr(): Node {
    if (++depth > MAX_DEPTH) throw new Error('This formula is nested too deeply.')
    let a = additive()
    if (isOp('>', '<', '>=', '<=', '=', '!=')) { const op = toks[p++].v; a = { t: 'bin', op, a, b: additive() } }
    depth--
    return a
  }
  function additive(): Node {
    let a = term()
    while (isOp('+', '-')) { const op = toks[p++].v; a = { t: 'bin', op, a, b: term() } }
    return a
  }
  function term(): Node {
    let a = unary()
    while (isOp('*', '/')) { const op = toks[p++].v; a = { t: 'bin', op, a, b: unary() } }
    return a
  }
  function unary(): Node {
    if (isOp('-')) { p++; return { t: 'neg', a: unary() } }
    return primary()
  }
  function primary(): Node {
    const t = toks[p]
    if (t.k === 'num') { p++; return { t: 'num', v: Number(t.v) } }
    if (isOp('(')) { p++; const e = expr(); eat(')'); return e }
    if (t.k !== 'id') throw unexpected(t)
    p++
    if (!isOp('(')) {
      const [key, col] = t.v.split('[].')
      return col ? { t: 'ref', key, col } : { t: 'ref', key }
    }
    if (!Object.hasOwn(ARITY, t.v)) throw new Error(`Unknown function "${t.v}".`)
    p++
    const args: Node[] = []
    if (!isOp(')')) {
      args.push(expr())
      while (isOp(',')) { p++; args.push(expr()) }
    }
    eat(')')
    const [lo, hi] = ARITY[t.v]
    if (args.length < lo || args.length > hi) throw new Error(`"${t.v}" takes ${lo === hi ? lo : `${lo} to ${hi}`} values.`)
    return { t: 'call', fn: t.v, args }
  }
  const ast = expr()
  if (toks[p].k !== 'end') throw unexpected(toks[p])
  return ast
}

/** Parses a formula without running it; errors are sentences for the builder. */
export function compile(src: string): Compiled {
  if (typeof src !== 'string' || !src.trim()) return { ok: false, error: 'Enter a formula.' }
  if (src.length > 500) return { ok: false, error: 'Keep the formula under 500 characters.' }
  try {
    const ast = parse(tokenize(src))
    const refs: Ref[] = []
    const walk = (n: Node): void => {
      if (n.t === 'ref') refs.push(n.col ? { key: n.key, col: n.col } : { key: n.key })
      else if (n.t === 'neg') walk(n.a)
      else if (n.t === 'bin') { walk(n.a); walk(n.b) }
      else if (n.t === 'call') n.args.forEach(walk)
    }
    walk(ast)
    return { ok: true, ast, refs }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

type Val = number | string | null | Val[]
const numOf = (v: Val): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const flat = (vals: Val[]): Val[] => vals.flatMap((v) => (Array.isArray(v) ? flat(v) : [v]))
const truthy = (v: Val) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== 0 && v !== '')

function fromAnswer(v: unknown): Val {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') return v
  // A repeating section's rows count as one each; a multi-select's choices stay text.
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? 1 : fromAnswer(x)))
  return null
}

function binary(op: string, a: Val, b: Val): Val {
  if (op === '=' || op === '!=') {
    const eq = a !== null && !Array.isArray(a) && a === b
    return (op === '=') === eq ? 1 : 0
  }
  if (op === '>' || op === '<' || op === '>=' || op === '<=') {
    let x = numOf(a)
    let y = numOf(b)
    if (x === null || y === null) { x = toDay(a); y = toDay(b) }
    if (x === null || y === null) return null
    return (op === '>' ? x > y : op === '<' ? x < y : op === '>=' ? x >= y : x <= y) ? 1 : 0
  }
  const x = numOf(a)
  const y = numOf(b)
  if (x === null || y === null) return null
  if (op === '+') return x + y
  if (op === '-') return x - y
  if (op === '*') return x * y
  return y === 0 ? null : x / y
}

function call(fn: string, args: Node[], ans: Answers): Val {
  if (fn === 'if') return truthy(run(args[0], ans)) ? run(args[1], ans) : run(args[2], ans)
  const vals = args.map((a) => run(a, ans))
  if (fn === 'days_between') {
    const a = toDay(vals[0])
    const b = toDay(vals[1])
    return a === null || b === null ? null : b - a
  }
  if (fn === 'round') {
    const x = numOf(vals[0])
    const d = vals.length > 1 ? numOf(vals[1]) : 0
    if (x === null || d === null || !Number.isInteger(d) || d < 0 || d > 10) return null
    return Math.round(x * 10 ** d) / 10 ** d
  }
  const items = flat(vals)
  if (fn === 'count') return items.filter((v) => v !== null && v !== '').length
  const nums = items.map(numOf).filter((v): v is number => v !== null)
  if (fn === 'sum') return nums.reduce((s, v) => s + v, 0)
  if (!nums.length) return null
  return fn === 'min' ? Math.min(...nums) : Math.max(...nums)
}

function run(n: Node, ans: Answers): Val {
  switch (n.t) {
    case 'num': return n.v
    case 'ref': {
      const v = Object.hasOwn(ans, n.key) ? ans[n.key] : undefined
      const col = n.col
      if (!col) return fromAnswer(v)
      return Array.isArray(v)
        ? v.map((r) => (r && typeof r === 'object' && Object.hasOwn(r, col) ? fromAnswer((r as Answers)[col]) : null))
        : []
    }
    case 'neg': { const a = numOf(run(n.a, ans)); return a === null ? null : -a }
    case 'bin': return binary(n.op, run(n.a, ans), run(n.b, ans))
    case 'call': return call(n.fn, n.args, ans)
  }
}

/** Value of a calculated field, or null when it cannot be computed. Never throws, never evals. */
export function calculate(expression: string, answers: Answers): number | null {
  const c = compile(expression)
  if (!c.ok) return null
  try {
    const v = run(c.ast, answers && typeof answers === 'object' ? answers : {})
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null // spec §4.4: a formula that cannot be computed leaves the field empty
  }
}
```

`supabase/functions/_shared/forms/index.ts`:
```ts
export * from './types.ts'
export * from './rules.ts'
export * from './expr.ts'
```

- [ ] **Step 8: Run — expect PASS under node**

Run: `pnpm test`
Expected: all rule and formula tests pass (plus the 10 existing Phase 1 tests).

- [ ] **Step 9: Run the same files under Deno**

Run: `deno test supabase/functions/_shared`
Expected: `ok | 20 passed | 0 failed` (rules 10 + expr 10; Deno runs `node:test` suites natively).

- [ ] **Step 10: Commit**

```bash
git add package.json supabase/functions/_shared/forms/types.ts supabase/functions/_shared/forms/rules.ts supabase/functions/_shared/forms/expr.ts supabase/functions/_shared/forms/index.ts supabase/functions/_shared/forms/rules.test.ts supabase/functions/_shared/forms/expr.test.ts
git commit -m "feat: add shared rule evaluator and formula parser"
```

---

### Task 2: Shared schema and answer validation

**Owner:** Backend engineer · **Depends on:** Task 1

**Files:**
- Create: `supabase/functions/_shared/forms/schema.ts`, `answers.ts`, `fixture.ts`
- Modify: `supabase/functions/_shared/forms/index.ts`
- Test: `supabase/functions/_shared/forms/schema.test.ts`, `answers.test.ts`

**Interfaces:**
- Consumes: `Field`, `Answers`, `evaluate`, `isEmpty`, `toDay`, `parsePath`, `compile`, `calculate` (Task 1).
- Produces:
  - `KEY_RE: RegExp` · `SECTION_FIELD_TYPES: readonly FieldType[]`
  - `type SchemaIssue = { key: string; message: string }` (`key` is `field` or `group.child`, `''` for the whole form)
  - `validateSchema(input: unknown): SchemaIssue[]`
  - `pages(fields: Field[]): Field[][]` (a page starts with its `page_break`; empty pages dropped)
  - `resolve(fields: Field[], raw: unknown, now?: Date): { answers: Answers; hidden: Set<string> }` (keeps only schema keys, strips hidden answers, recomputes calculated)
  - `visiblePages(fields: Field[], raw: unknown, now?: Date): number[]`
  - `validateAnswers(fields: Field[], raw: unknown, opts?: { now?: Date; filePrefix?: string; onlyKeys?: ReadonlySet<string> }): { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> }` (error keys `field` or `group.<row>.child`)

- [ ] **Step 1: Write the fixture** — `supabase/functions/_shared/forms/fixture.ts` (tests only; one form using all 12 types)

```ts
import type { Field } from './types.ts'

export const ORG = '0000000a-0000-0000-0000-000000000001'
export const USER = '00000000-0000-0000-0000-0000000000a3'
export const PREFIX = `${ORG}/${USER}/`

export const FORM: Field[] = [
  { key: 'name', type: 'short_text', label: 'Full name', required: true },
  { key: 'reason', type: 'long_text', label: 'Reason' },
  { key: 'leave_type', type: 'single_select', label: 'Leave type', required: true, options: ['Annual', 'Medical', 'Other'] },
  { key: 'other_reason', type: 'short_text', label: 'Other reason', required: true, show_if: { field: 'leave_type', operator: 'is', value: 'Other' } },
  { key: 'mc', type: 'file', label: 'Medical certificate', required: true, show_if: { field: 'leave_type', operator: 'is', value: 'Medical' } },
  { key: 'p2', type: 'page_break', label: 'Dates' },
  { key: 'start', type: 'date', label: 'First day', required: true },
  { key: 'end', type: 'date', label: 'Last day', required: true },
  { key: 'days', type: 'calculated', label: 'Days', expression: 'days_between(start, end) + 1' },
  { key: 'cover', type: 'multi_select', label: 'Cover arranged with', options: ['Team lead', 'Peer'] },
  { key: 'p3', type: 'page_break', label: 'Expenses' },
  {
    key: 'claims', type: 'group', label: 'Claims', repeat: { min: 0, max: 3 }, fields: [
      { key: 'item', type: 'short_text', label: 'Item', required: true },
      { key: 'amount', type: 'number', label: 'Amount', required: true },
    ],
  },
  { key: 'total', type: 'calculated', label: 'Total claimed', expression: 'sum(claims[].amount)' },
  { key: 'agree', type: 'checkbox', label: 'I confirm these details are true', required: true },
  { key: 'sig', type: 'signature', label: 'Signature', required: true },
]

export const VALID = {
  name: 'Ada', leave_type: 'Annual', start: '2026-10-12', end: '2026-10-14',
  claims: [{ item: 'Taxi', amount: 12.5 }], agree: true, sig: `${PREFIX}sig.png`,
}
```

- [ ] **Step 2: Write the failing schema tests** — `supabase/functions/_shared/forms/schema.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSchema } from './schema.ts'
import { FORM } from './fixture.ts'

const text = (fields: unknown) => validateSchema(fields).map((i) => `${i.key}: ${i.message}`).join('\n')
const withA = (f: Record<string, unknown>) => text([{ key: 'a', type: 'short_text', label: 'A' }, f])

test('the fixture form with all 12 field types is valid', () => {
  assert.equal(text(FORM), '')
  const types = new Set([...FORM, ...FORM.flatMap((f) => f.fields ?? [])].map((f) => f.type))
  assert.equal(types.size, 12)
})
test('form-level shape', () => {
  assert.match(text('x'), /must be a list of fields/)
  assert.match(text(Array.from({ length: 201 }, (_, i) => ({ key: `f${i}`, type: 'number', label: 'N' }))), /at most 200 fields/)
  assert.match(text([1]), /Every field must be an object/)
})
test('keys, types and labels', () => {
  assert.match(withA({ key: 'Bad key', type: 'number', label: 'N' }), /^Bad key: Use a key of lowercase/m)
  assert.match(withA({ key: 'a', type: 'number', label: 'N' }), /^a: The key "a" is used twice/m)
  assert.match(withA({ key: 'b', type: 'rating', label: 'R' }), /^b: Choose a field type/m)
  assert.match(withA({ key: 'b', type: 'number', label: ' ' }), /^b: Give the field a label/m)
  assert.equal(withA({ key: 'b', type: 'page_break' }), '')
})
test('select options', () => {
  assert.match(withA({ key: 'b', type: 'single_select', label: 'S', options: [] }), /between 1 and 100 options/)
  assert.match(withA({ key: 'b', type: 'multi_select', label: 'S', options: ['x', 'x'] }), /Each option must be different/)
})
test('repeating sections', () => {
  const g = (over: Record<string, unknown>) => withA({ key: 'g', type: 'group', label: 'G', repeat: { min: 0, max: 2 }, fields: [{ key: 'x', type: 'number', label: 'X' }], ...over })
  assert.equal(g({}), '')
  assert.match(g({ repeat: { min: 3, max: 2 } }), /minimum not above maximum/)
  assert.match(g({ fields: [] }), /between 1 and 50 fields/)
  assert.match(g({ fields: [{ key: 'x', type: 'calculated', label: 'X', expression: '1' }] }), /^g\.x: A repeating section cannot contain/m)
  assert.match(g({ fields: [{ key: 'x', type: 'number', label: 'X' }, { key: 'x', type: 'date', label: 'Y' }] }), /^g\.x: The key "x" is used twice/m)
})
test('calculated formulas must parse and read fields above them', () => {
  assert.match(withA({ key: 'c', type: 'calculated', label: 'C', expression: 'a +' }), /^c: The formula ends too early/m)
  assert.match(text([{ key: 'c', type: 'calculated', label: 'C', expression: 'b * 2' }, { key: 'b', type: 'number', label: 'B' }]), /"b" must be a field above this one/)
  assert.match(withA({ key: 'c', type: 'calculated', label: 'C', expression: 'sum(a[].x)' }), /"a\[\]\.x" is not a column/)
})
test('show_if must point at a real field with a usable value', () => {
  const rule = (show_if: unknown) => withA({ key: 'b', type: 'number', label: 'B', show_if })
  assert.equal(rule({ field: 'a', operator: 'is', value: 'x' }), '')
  assert.match(rule({ field: 'zzz', operator: 'is', value: 'x' }), /points at a field that does not exist/)
  assert.match(rule({ field: 'b', operator: 'is_empty' }), /points at a field that does not exist/)
  assert.match(rule({ field: 'a', operator: 'is_one_of', value: 'x' }), /Give the show-if rule a value/)
  assert.match(rule({ field: 'a.count', operator: 'gt', value: 1 }), /Only repeating sections support/)
  assert.match(rule({ field: 'a', operator: 'nope' }), /Finish the show-if rule/)
})
```

- [ ] **Step 3: Write the failing answer tests** — `supabase/functions/_shared/forms/answers.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pages, resolve, validateAnswers, visiblePages } from './answers.ts'
import { FORM, PREFIX, VALID } from './fixture.ts'
import type { Field } from './types.ts'

const now = new Date('2026-10-11T12:00:00Z')
const check = (answers: unknown, extra = {}) => validateAnswers(FORM, answers, { now, filePrefix: PREFIX, ...extra })
const errorsOf = (answers: unknown, extra = {}) => {
  const r = check(answers, extra)
  return r.ok ? {} : r.errors
}

test('a complete submission passes and calculated values are recomputed', () => {
  const r = check({ ...VALID, days: 99, total: 9999 })
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.answers.days, 3)
    assert.equal(r.answers.total, 12.5)
  }
})
test('unknown keys and page breaks are dropped', () => {
  const r = check({ ...VALID, hack: 1, p2: 'x' })
  assert.ok(r.ok && !('hack' in r.answers) && !('p2' in r.answers))
})
test('required fields are reported by key', () => {
  assert.deepEqual(errorsOf({}), {
    name: 'This field is required.', leave_type: 'This field is required.', start: 'This field is required.',
    end: 'This field is required.', agree: 'Tick this box to continue.', sig: 'This field is required.',
  })
})
test('a hidden required field is not required, and its answer is stripped', () => {
  const r = check({ ...VALID, other_reason: 'smuggled', mc: `${PREFIX}x.pdf` })
  assert.ok(r.ok && !('other_reason' in r.answers) && !('mc' in r.answers))
  assert.deepEqual(errorsOf({ ...VALID, leave_type: 'Medical' }), { mc: 'This field is required.' })
  assert.deepEqual(errorsOf({ ...VALID, leave_type: 'Other' }), { other_reason: 'This field is required.' })
})
test("files must sit in the caller's own folder", () => {
  const other = '0000000a-0000-0000-0000-000000000001/00000000-0000-0000-0000-0000000000a2/sig.png'
  assert.deepEqual(errorsOf({ ...VALID, sig: other }), { sig: 'Sign again.' })
  assert.deepEqual(errorsOf({ ...VALID, sig: '../../etc/passwd' }), { sig: 'Sign again.' })
})
test('values must match their field type', () => {
  assert.deepEqual(errorsOf({ ...VALID, name: 5, start: '2026-02-30', leave_type: 'Sabbatical', cover: ['Peer', 'Peer'], agree: 'yes' }), {
    name: 'Enter text.', start: 'Enter a valid date.', leave_type: 'Choose one of the options.',
    cover: 'Choose from the listed options.', agree: 'Tick or untick this box.',
  })
})
test('repeating sections enforce row counts and validate each row', () => {
  assert.deepEqual(errorsOf({ ...VALID, claims: [{ item: 'Taxi' }, { amount: 3 }] }), {
    'claims.0.amount': 'This field is required.', 'claims.1.item': 'This field is required.',
  })
  const four = ['a', 'b', 'c', 'd'].map((item) => ({ item, amount: 1 }))
  assert.deepEqual(errorsOf({ ...VALID, claims: four }), { claims: 'Add no more than 3 rows.' })
  assert.deepEqual(errorsOf({ ...VALID, claims: ['x'] }), { claims: 'Fill in the section again.' })
  const r = check({ ...VALID, claims: [{ item: 'Taxi', amount: 2, extra: 'x' }] })
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.answers.claims, [{ item: 'Taxi', amount: 2 }])
})
test('onlyKeys limits validation to one page', () => {
  const page1 = new Set(pages(FORM)[0].map((f) => f.key))
  assert.deepEqual(errorsOf({ name: 'Ada' }, { onlyKeys: page1 }), { leave_type: 'This field is required.' })
})
test('pages split at page breaks and fully hidden pages are skipped', () => {
  assert.deepEqual(pages(FORM).map((p) => p.length), [5, 5, 5])
  const f = [
    { key: 'a', type: 'checkbox', label: 'A' },
    { key: 'b', type: 'page_break', label: 'B' },
    { key: 'c', type: 'short_text', label: 'C', show_if: { field: 'a', operator: 'is', value: true } },
    { key: 'd', type: 'page_break', label: 'D' },
    { key: 'e', type: 'short_text', label: 'E' },
  ] as Field[]
  assert.deepEqual(visiblePages(f, {}, now), [0, 2])
  assert.deepEqual(visiblePages(f, { a: true }, now), [0, 1, 2])
})
test('non-object answers never throw', () => {
  for (const bad of [null, 'x', 42, []]) assert.equal(check(bad).ok, false)
  assert.equal(resolve(FORM, null, now).answers.total, 0)
})
```

- [ ] **Step 4: Run — expect FAIL**

Run: `pnpm test`
Expected: `Cannot find module '…/schema.ts'` and `'…/answers.ts'`.

- [ ] **Step 5: Implement schema validation** — `supabase/functions/_shared/forms/schema.ts`

```ts
import { FIELD_TYPES, OPERATORS, type Field, type FieldType } from './types.ts'
import { compile } from './expr.ts'
import { parsePath } from './rules.ts'

export type SchemaIssue = { key: string; message: string }
export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/
export const SECTION_FIELD_TYPES: readonly FieldType[] = [
  'short_text', 'long_text', 'number', 'date', 'single_select', 'multi_select', 'checkbox', 'file', 'signature',
]
type Add = (message: string) => void
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Checks a form definition; the builder shows the issues, submit-form refuses a form that has any. */
export function validateSchema(input: unknown): SchemaIssue[] {
  if (!Array.isArray(input)) return [{ key: '', message: 'The form definition must be a list of fields.' }]
  if (input.length > 200) return [{ key: '', message: 'A form can have at most 200 fields.' }]
  const issues: SchemaIssue[] = []
  const fields = input.filter(isObj) as Field[]
  if (fields.length !== input.length) issues.push({ key: '', message: 'Every field must be an object.' })
  checkList(fields, [], issues, null)
  return issues
}

function checkList(fields: Field[], outer: Field[], issues: SchemaIssue[], group: Field | null) {
  const seen = new Set<string>()
  fields.forEach((f, i) => {
    const key = typeof f.key === 'string' ? f.key : ''
    const add: Add = (message) => issues.push({ key: group ? `${group.key}.${key}` : key, message })
    if (!KEY_RE.test(key)) add('Use a key of lowercase letters, numbers and underscores, starting with a letter.')
    else if (seen.has(key)) add(`The key "${key}" is used twice.`)
    seen.add(key)
    if (!(FIELD_TYPES as readonly string[]).includes(f.type)) return add('Choose a field type.')
    if (group && !SECTION_FIELD_TYPES.includes(f.type)) add('A repeating section cannot contain page breaks, sections or calculated fields.')
    if (f.type !== 'page_break' && (typeof f.label !== 'string' || !f.label.trim() || f.label.length > 200)) add('Give the field a label under 200 characters.')
    if (f.help !== undefined && (typeof f.help !== 'string' || f.help.length > 500)) add('Keep the help text under 500 characters.')
    if (f.type === 'single_select' || f.type === 'multi_select') checkOptions(f.options, add)
    if (f.type === 'group' && !group) checkGroup(f, fields, issues, add)
    if (f.type === 'calculated') checkExpression(f, fields.slice(0, i), add)
    if (f.show_if !== undefined) checkRule(f.show_if, key, group ? [...outer, ...fields] : fields, add)
  })
}

function checkOptions(options: unknown, add: Add) {
  if (!Array.isArray(options) || options.length === 0 || options.length > 100) return add('Add between 1 and 100 options.')
  if (options.some((o) => typeof o !== 'string' || !o.trim() || o.length > 200)) return add('Options must be text under 200 characters.')
  if (new Set(options).size !== options.length) add('Each option must be different.')
}

function checkGroup(f: Field, top: Field[], issues: SchemaIssue[], add: Add) {
  const r = f.repeat
  if (!isObj(r) || !Number.isInteger(r.min) || !Number.isInteger(r.max) || r.min < 0 || r.max < 1 || r.min > r.max || r.max > 50) {
    add('Set rows between 0 and 50, with the minimum not above maximum.')
  }
  if (!Array.isArray(f.fields) || f.fields.length === 0 || f.fields.length > 50) return add('Add between 1 and 50 fields to the section.')
  checkList(f.fields.filter(isObj) as Field[], top, issues, f)
}

function checkExpression(f: Field, earlier: Field[], add: Add) {
  const c = compile(f.expression ?? '')
  if (!c.ok) return add(c.error)
  for (const r of c.refs) {
    const target = earlier.find((e) => e.key === r.key && e.type !== 'page_break')
    if (!target) { add(`"${r.key}" must be a field above this one.`); continue }
    if (r.col && !(target.type === 'group' && target.fields?.some((x) => x.key === r.col))) {
      add(`"${r.key}[].${r.col}" is not a column of a repeating section.`)
    }
  }
}

function checkRule(rule: unknown, self: string, scope: Field[], add: Add) {
  if (!isObj(rule) || typeof rule.field !== 'string' || !(OPERATORS as readonly string[]).includes(rule.operator as string)) {
    return add('Finish the show-if rule: choose a field and a condition.')
  }
  const p = parsePath(rule.field)
  const target = p && p.root !== self ? scope.find((f) => f.key === p.root && f.type !== 'page_break') : undefined
  if (!p || !target) return add('The show-if rule points at a field that does not exist.')
  if ((p.col || p.count) && target.type !== 'group') return add('Only repeating sections support [] and .count.')
  if (p.col && !target.fields?.some((c) => c.key === p.col)) return add('The show-if rule points at a column that does not exist.')
  const op = rule.operator
  if (op === 'is_empty' || op === 'is_not_empty') return
  const v = rule.value
  const ok = op === 'is_one_of' ? Array.isArray(v) && v.length > 0
    : op === 'within_days' ? typeof v === 'number' && v >= 0
    : v !== undefined && v !== null && v !== ''
  if (!ok) add('Give the show-if rule a value.')
}
```

- [ ] **Step 6: Implement answer validation** — `supabase/functions/_shared/forms/answers.ts`

```ts
import type { Answers, Field } from './types.ts'
import { evaluate, isEmpty, toDay } from './rules.ts'
import { calculate } from './expr.ts'

export type Resolved = { answers: Answers; hidden: Set<string> }
export type CheckOptions = { now?: Date; filePrefix?: string; onlyKeys?: ReadonlySet<string> }
export type Checked = { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> }

const isObj = (v: unknown): v is Answers => !!v && typeof v === 'object' && !Array.isArray(v)
const FILE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/

/** Splits at each page_break; the break opens (and titles) the next page. Empty pages are dropped. */
export function pages(fields: Field[]): Field[][] {
  const out: Field[][] = [[]]
  for (const f of fields) {
    if (f.type === 'page_break') out.push([f])
    else out[out.length - 1].push(f)
  }
  return out.filter((p) => p.some((f) => f.type !== 'page_break'))
}

/** Keeps schema keys only, drops answers to hidden fields and recomputes every calculated field. */
export function resolve(fields: Field[], raw: unknown, now: Date = new Date()): Resolved {
  const input: Answers = isObj(raw) ? raw : {}
  const answers: Answers = {}
  const hidden = new Set<string>()
  for (const f of fields) {
    if (f.type !== 'page_break' && f.type !== 'calculated' && Object.hasOwn(input, f.key)) answers[f.key] = input[f.key]
  }
  const calcs = fields.filter((f) => f.type === 'calculated')
  const fillCalcs = () => {
    for (const f of calcs) if (!hidden.has(f.key)) answers[f.key] = calculate(f.expression ?? '', answers)
  }
  fillCalcs() // first pass so a show_if may read a calculated value
  for (const f of fields) if (f.show_if && !evaluate(f.show_if, answers, now)) hidden.add(f.key)
  for (const k of hidden) delete answers[k]
  for (const f of fields) {
    const rows = answers[f.key]
    if (f.type !== 'group' || !Array.isArray(rows)) continue
    answers[f.key] = rows.map((row) => {
      if (!isObj(row)) return row
      const clean: Answers = {}
      for (const c of f.fields ?? []) {
        if (!Object.hasOwn(row, c.key)) continue
        if (c.show_if && !evaluate(c.show_if, { ...answers, ...row }, now)) continue
        clean[c.key] = row[c.key]
      }
      return clean
    })
  }
  fillCalcs() // second pass sees only visible answers
  return { answers, hidden }
}

export function visiblePages(fields: Field[], raw: unknown, now: Date = new Date()): number[] {
  const { hidden } = resolve(fields, raw, now)
  return pages(fields).flatMap((p, i) => (p.some((f) => f.type !== 'page_break' && !hidden.has(f.key)) ? [i] : []))
}

const text = (v: unknown, max: number) =>
  typeof v !== 'string' ? 'Enter text.' : v.length > max ? `Keep this under ${max.toLocaleString('en-GB')} characters.` : null

function checkValue(f: Field, v: unknown, prefix?: string): string | null {
  if (isEmpty(v)) return f.required ? (f.type === 'checkbox' ? 'Tick this box to continue.' : 'This field is required.') : null
  switch (f.type) {
    case 'short_text': return text(v, 500)
    case 'long_text': return text(v, 10000)
    case 'number': return typeof v === 'number' && Number.isFinite(v) ? null : 'Enter a number.'
    case 'date': return toDay(v) !== null ? null : 'Enter a valid date.'
    case 'single_select': return typeof v === 'string' && !!f.options?.includes(v) ? null : 'Choose one of the options.'
    case 'multi_select':
      return Array.isArray(v) && new Set(v).size === v.length && v.every((x) => typeof x === 'string' && !!f.options?.includes(x))
        ? null : 'Choose from the listed options.'
    case 'checkbox': return v === true ? null : 'Tick or untick this box.'
    case 'file':
    case 'signature': {
      const ok = typeof v === 'string' && FILE_PATH.test(v) && (!prefix || v.startsWith(prefix))
      return ok ? null : f.type === 'file' ? 'Upload the file again.' : 'Sign again.'
    }
    default: return null
  }
}

function checkGroup(f: Field, answers: Answers, errors: Record<string, string>, opts: CheckOptions, now: Date) {
  const rows = answers[f.key] ?? []
  const { min, max } = f.repeat ?? { min: 0, max: 50 }
  const need = Math.max(min, f.required ? 1 : 0)
  const rowsWord = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`
  if (!Array.isArray(rows) || rows.some((r) => !isObj(r))) { errors[f.key] = 'Fill in the section again.'; return }
  if (rows.length < need) { errors[f.key] = `Add at least ${rowsWord(need)}.`; return }
  if (rows.length > max) { errors[f.key] = `Add no more than ${rowsWord(max)}.`; return }
  rows.forEach((row: Answers, i) => {
    for (const c of f.fields ?? []) {
      if (c.show_if && !evaluate(c.show_if, { ...answers, ...row }, now)) continue
      const msg = checkValue(c, row[c.key], opts.filePrefix)
      if (msg) errors[`${f.key}.${i}.${c.key}`] = msg
      else if (isEmpty(row[c.key])) delete row[c.key]
    }
  })
  if (rows.length === 0) delete answers[f.key]
}

/** Shared by the browser (per page, for UX) and submit-form (whole form, the authority). */
export function validateAnswers(fields: Field[], raw: unknown, opts: CheckOptions = {}): Checked {
  const now = opts.now ?? new Date()
  if (!isObj(raw)) return { ok: false, errors: { '': 'Send the answers as an object.' } }
  const { answers, hidden } = resolve(fields, raw, now)
  const errors: Record<string, string> = {}
  for (const f of fields) {
    if (f.type === 'page_break' || f.type === 'calculated' || hidden.has(f.key)) continue
    if (opts.onlyKeys && !opts.onlyKeys.has(f.key)) continue
    if (f.type === 'group') { checkGroup(f, answers, errors, opts, now); continue }
    const msg = checkValue(f, answers[f.key], opts.filePrefix)
    if (msg) errors[f.key] = msg
    else if (isEmpty(answers[f.key])) delete answers[f.key]
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers }
}
```

Append to `supabase/functions/_shared/forms/index.ts`:
```ts
export * from './schema.ts'
export * from './answers.ts'
```

- [ ] **Step 7: Run — expect PASS under node and Deno**

Run: `pnpm test && deno test supabase/functions/_shared`
Expected: node all pass; Deno `ok | 37 passed | 0 failed` (20 from Task 1 + schema 7 + answers 10).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/forms/schema.ts supabase/functions/_shared/forms/answers.ts supabase/functions/_shared/forms/fixture.ts supabase/functions/_shared/forms/index.ts supabase/functions/_shared/forms/schema.test.ts supabase/functions/_shared/forms/answers.test.ts
git commit -m "feat: add shared form schema and answer validation"
```

---

### Task 3: Database — forms, submissions, storage

**Owner:** Backend engineer · **Depends on:** — (Phase 1 migrations)

**Files:**
- Create: `supabase/migrations/20261013000001_forms.sql`, `supabase/tests/05_forms.test.sql`
- Modify: `supabase/seed.sql`, `src/data/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `is_member(uuid)`, `has_permission(uuid, text)`, `audit(uuid, text, text, jsonb, jsonb)` (Phase 1).
- Produces:
  - `forms(id, org_id, name, schema jsonb array, created_by, created_at, updated_at)`; `unique (id, org_id)`.
  - `form_submissions(id, org_id, form_id, answers jsonb object, submitted_by, created_at)`; FK `(form_id, org_id) → forms(id, org_id) on delete restrict`.
  - RLS: `forms` select `is_member(org_id)`; insert/update/delete `has_permission(org_id, 'forms.manage')`. `form_submissions` select own (and member) or `forms.manage`; no client insert/update/delete.
  - Triggers: `created_by := auth.uid()` on insert; `updated_at := now()` on update; org move refused (42501); `form.create` / `form.update` / `form.delete` written to `audit_log`.
  - Storage: private bucket `form-files` (10 MB); `storage_path_org(text) → uuid` (plain SQL, not definer); insert into own `<org>/<uid>/` folder when a member; read own files, or all org files with `forms.manage`.
  - Seed: form `0000000a-0000-0000-0000-0000000000f1` "Leave request" in Alpha School.

- [ ] **Step 1: Write the failing test** — `supabase/tests/05_forms.test.sql`

```sql
begin;
select plan(23);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set f1 0000000a-0000-0000-0000-0000000000f1
\set f2 0000000a-0000-0000-0000-0000000000f2

-- Admin (holds forms.manage) creates and renames a form; created_by is forced; both audited
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(format($$ insert into forms (id, org_id, name, schema, created_by) values (%L, %L, 'Trip consent', '[]', '00000000-0000-0000-0000-0000000000a1') $$, :'f2', :'alpha'), 'admin creates a form');
select is((select created_by::text from forms where id = :'f2'), '00000000-0000-0000-0000-0000000000a2', 'created_by is the caller, not the client value');
select isnt_empty(format($$ select 1 from audit_log where action = 'form.create' and target = %L $$, :'f2'), 'form create audited');
select lives_ok(format($$ update forms set name = 'Trip consent 2027' where id = %L $$, :'f2'), 'admin renames a form');
select isnt_empty(format($$ select 1 from audit_log where action = 'form.update' and target = %L and after->>'name' = 'Trip consent 2027' $$, :'f2'), 'form update audited');

-- Member reads but cannot write
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format($$ select count(*)::int from forms where org_id = %L $$, :'alpha'), array[2], 'member reads the org forms');
select throws_ok(format($$ insert into forms (org_id, name) values (%L, 'Nope') $$, :'alpha'), '42501', null, 'member cannot create forms');
select is_empty(format($$ update forms set name = 'Hacked' where id = %L returning id $$, :'f1'), 'member cannot edit forms');
select is_empty(format($$ delete from forms where id = %L returning id $$, :'f1'), 'member cannot delete forms');
select throws_ok(format($$ insert into form_submissions (org_id, form_id, answers, submitted_by) values (%L, %L, '{}', auth.uid()) $$, :'alpha', :'f1'),
  '42501', null, 'clients cannot insert submissions');

-- Another org sees and writes nothing
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is_empty(format($$ select 1 from forms where org_id = %L $$, :'alpha'), 'beta owner cannot read alpha forms');
select throws_ok(format($$ insert into forms (org_id, name) values (%L, 'Sneaky') $$, :'alpha'), '42501', null, 'beta owner cannot create alpha forms');

-- Submission visibility (row written as the service role would)
reset role;
insert into form_submissions (org_id, form_id, answers, submitted_by)
values (:'alpha', :'f1', '{"name":"Ada"}', '00000000-0000-0000-0000-0000000000a3');
select throws_ok(format($$ insert into form_submissions (org_id, form_id, answers, submitted_by) values (%L, %L, '{}', '00000000-0000-0000-0000-0000000000b1') $$, :'beta', :'f1'),
  '23503', null, 'a submission must belong to its form''s org');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is_empty($$ select 1 from form_submissions $$, 'viewer cannot read other people''s submissions');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select isnt_empty($$ select 1 from form_submissions $$, 'submitter reads own submission');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select isnt_empty($$ select 1 from form_submissions $$, 'forms.manage reads every submission');
select throws_ok(format($$ delete from forms where id = %L $$, :'f1'), '23503', null, 'a form with submissions cannot be deleted');
select throws_ok(format($$ update forms set org_id = %L where id = %L $$, :'beta', :'f2'), '42501', null, 'a form cannot move to another org');

-- Storage: own folder only, org-scoped reads
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('form-files', %L) $$, :'alpha' || '/00000000-0000-0000-0000-0000000000a3/mc.pdf'),
  'member uploads into their own folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('form-files', %L) $$, :'alpha' || '/00000000-0000-0000-0000-0000000000a2/x.pdf'),
  '42501', null, 'cannot upload into another user''s folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('form-files', %L) $$, :'beta' || '/00000000-0000-0000-0000-0000000000a3/x.pdf'),
  '42501', null, 'cannot upload into an org you do not belong to');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is_empty($$ select 1 from storage.objects where bucket_id = 'form-files' $$, 'viewer cannot read another member''s files');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select isnt_empty($$ select 1 from storage.objects where bucket_id = 'form-files' $$, 'forms.manage reads the org files');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — expect FAIL**

Run: `supabase db reset && supabase test db`
Expected: `05_forms.test.sql` fails with `relation "forms" does not exist`.

- [ ] **Step 3: Implement** — `supabase/migrations/20261013000001_forms.sql`

```sql
create table forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  schema jsonb not null default '[]' check (jsonb_typeof(schema) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index forms_org_idx on forms (org_id);

-- Standalone until Phase 3 renames it to `submissions` and adds record_id / node_id / outcome.
create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  form_id uuid not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  submitted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (form_id, org_id) references forms (id, org_id) on delete restrict
);
create index form_submissions_form_idx on form_submissions (form_id, created_at desc);

alter table forms enable row level security;
alter table form_submissions enable row level security;

create policy forms_read on forms for select using (is_member(org_id));
create policy forms_insert on forms for insert with check (has_permission(org_id, 'forms.manage'));
create policy forms_update on forms for update
  using (has_permission(org_id, 'forms.manage')) with check (has_permission(org_id, 'forms.manage'));
create policy forms_delete on forms for delete using (has_permission(org_id, 'forms.manage'));

create policy form_submissions_read on form_submissions for select
  using ((submitted_by = auth.uid() and is_member(org_id)) or has_permission(org_id, 'forms.manage'));
-- No insert/update/delete policies: submit-form (service role) is the only writer, after validating.

create or replace function forms_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger forms_before_write before insert or update on forms for each row execute function forms_before_write();

create or replace function audit_forms() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit(new.org_id, 'form.create', new.id::text, null, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' then
    perform audit(new.org_id, 'form.update', new.id::text,
      jsonb_build_object('name', old.name, 'fields', jsonb_array_length(old.schema)),
      jsonb_build_object('name', new.name, 'fields', jsonb_array_length(new.schema)));
  else
    perform audit(old.org_id, 'form.delete', old.id::text, jsonb_build_object('name', old.name), null);
  end if;
  return null;
end $$;
revoke execute on function audit_forms() from public, anon, authenticated;
create trigger forms_audit after insert or update or delete on forms for each row execute function audit_forms();

-- Files and signatures: <org_id>/<user_id>/<uuid>-<name>, private.
insert into storage.buckets (id, name, public, file_size_limit)
values ('form-files', 'form-files', false, 10485760)
on conflict (id) do nothing;

-- Plain SQL (not security definer): parses the org folder, null when the path is not ours.
create or replace function storage_path_org(p_name text) returns uuid language sql immutable as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(p_name, '/', 1)::uuid end
$$;

create policy form_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'form-files'
    and split_part(name, '/', 2) = auth.uid()::text
    and public.is_member(public.storage_path_org(name)));
create policy form_files_read on storage.objects for select to authenticated
  using (bucket_id = 'form-files' and (
    (split_part(name, '/', 2) = auth.uid()::text and public.is_member(public.storage_path_org(name)))
    or public.has_permission(public.storage_path_org(name), 'forms.manage')));
-- No update/delete policies: an uploaded file is never overwritten.
```

- [ ] **Step 4: Seed a form** — append to `supabase/seed.sql` (same field list as `fixture.ts`, so the browser checks in Tasks 7–9 exercise all 12 types)

```sql
-- A sample form for browser checks (Phase 2).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into forms (id, org_id, name, schema) values ('0000000a-0000-0000-0000-0000000000f1', '0000000a-0000-0000-0000-000000000001', 'Leave request', $json$[
  {"key":"name","type":"short_text","label":"Full name","required":true},
  {"key":"reason","type":"long_text","label":"Reason"},
  {"key":"leave_type","type":"single_select","label":"Leave type","required":true,"options":["Annual","Medical","Other"]},
  {"key":"other_reason","type":"short_text","label":"Other reason","required":true,"show_if":{"field":"leave_type","operator":"is","value":"Other"}},
  {"key":"mc","type":"file","label":"Medical certificate","required":true,"show_if":{"field":"leave_type","operator":"is","value":"Medical"}},
  {"key":"p2","type":"page_break","label":"Dates"},
  {"key":"start","type":"date","label":"First day","required":true},
  {"key":"end","type":"date","label":"Last day","required":true},
  {"key":"days","type":"calculated","label":"Days","expression":"days_between(start, end) + 1"},
  {"key":"cover","type":"multi_select","label":"Cover arranged with","options":["Team lead","Peer"]},
  {"key":"p3","type":"page_break","label":"Expenses"},
  {"key":"claims","type":"group","label":"Claims","repeat":{"min":0,"max":3},"fields":[
    {"key":"item","type":"short_text","label":"Item","required":true},
    {"key":"amount","type":"number","label":"Amount","required":true}]},
  {"key":"total","type":"calculated","label":"Total claimed","expression":"sum(claims[].amount)"},
  {"key":"agree","type":"checkbox","label":"I confirm these details are true","required":true},
  {"key":"sig","type":"signature","label":"Signature","required":true}
]$json$);
```

- [ ] **Step 5: Run — expect PASS**

Run: `supabase db reset && supabase test db`
Expected: `All tests successful.` — 5 files, 70 tests (47 from Phase 1 + 23).

- [ ] **Step 6: Regenerate types and commit**

```bash
pnpm db:types
git add supabase/migrations/20261013000001_forms.sql supabase/tests/05_forms.test.sql supabase/seed.sql src/data/database.types.ts
git commit -m "feat: add forms, form submissions and form file storage with RLS"
```

---

### Task 4: Edge Function `submit-form`

**Owner:** Backend engineer · **Depends on:** Tasks 2, 3

**Files:**
- Create: `supabase/functions/submit-form/handler.ts`, `supabase/functions/submit-form/index.ts`
- Test: `supabase/functions/submit-form/handler.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `validateSchema`, `validateAnswers`, `Field`, `Answers` (Task 2); `forms`, `form_submissions` (Task 3).
- Produces: `POST /functions/v1/submit-form` body `{ formId: string, answers: object }` →
  - `200 { submissionId, answers }` (answers as stored: hidden stripped, calculated recomputed)
  - `400 { error }` bad body · `400 { error: 'Some answers need fixing.', fieldErrors: Record<string, string> }`
  - `401 { error }` no valid session · `404 { error }` form missing or caller not a member · `409 { error }` form definition invalid
  - `413 { error }` body over 1 MB · `500 { error }` storage failure
- Produces (for tests): `submitForm(body: unknown, deps: Deps): Promise<{ status: number; body: Record<string, unknown> }>` with `Deps = { userId(): Promise<string | null>; loadForm(id: string): Promise<{ id: string; org_id: string; schema: unknown } | null>; insert(row: { org_id: string; form_id: string; answers: Answers; submitted_by: string }): Promise<string>; now(): Date }`.

- [ ] **Step 1: Write the failing test** — `supabase/functions/submit-form/handler.test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { submitForm, type Deps } from './handler.ts'
import { FORM, ORG, PREFIX, USER, VALID } from '../_shared/forms/fixture.ts'

const FORM_ID = '0000000a-0000-0000-0000-0000000000f1'

function setup(over: Partial<Deps> = {}) {
  const inserted: Record<string, unknown>[] = []
  const deps: Deps = {
    userId: () => Promise.resolve(USER),
    loadForm: (id) => Promise.resolve(id === FORM_ID ? { id, org_id: ORG, schema: FORM } : null),
    insert: (row) => { inserted.push(row); return Promise.resolve('sub-1') },
    now: () => new Date('2026-10-11T12:00:00Z'),
    ...over,
  }
  return { deps, inserted }
}

Deno.test('rejects a malformed body', async () => {
  const { deps } = setup()
  assertEquals((await submitForm(null, deps)).status, 400)
  assertEquals((await submitForm({ formId: 'x', answers: {} }, deps)).status, 400)
  assertEquals((await submitForm({ formId: FORM_ID, answers: [] }, deps)).status, 400)
})
Deno.test('401 without a session', async () => {
  const { deps } = setup({ userId: () => Promise.resolve(null) })
  assertEquals((await submitForm({ formId: FORM_ID, answers: VALID }, deps)).status, 401)
})
Deno.test('404 when the form is not visible to the caller', async () => {
  const { deps } = setup()
  const res = await submitForm({ formId: '0000000b-0000-0000-0000-0000000000f9', answers: VALID }, deps)
  assertEquals(res.status, 404)
})
Deno.test('409 when the stored form definition is invalid', async () => {
  const { deps, inserted } = setup({ loadForm: (id) => Promise.resolve({ id, org_id: ORG, schema: [{ key: 'Bad', type: 'x' }] }) })
  assertEquals((await submitForm({ formId: FORM_ID, answers: {} }, deps)).status, 409)
  assertEquals(inserted.length, 0)
})
Deno.test('400 with field errors and nothing stored', async () => {
  const { deps, inserted } = setup()
  const res = await submitForm({ formId: FORM_ID, answers: { ...VALID, name: '' } }, deps)
  assertEquals(res.status, 400)
  assertEquals(res.body.fieldErrors, { name: 'This field is required.' })
  assertEquals(inserted.length, 0)
})
Deno.test('recomputes calculated values and discards client values', async () => {
  const { deps, inserted } = setup()
  const res = await submitForm({ formId: FORM_ID, answers: { ...VALID, days: 99, total: 9999, hack: 'x' } }, deps)
  assertEquals(res.status, 200)
  assertEquals(res.body.submissionId, 'sub-1')
  const row = inserted[0] as { org_id: string; submitted_by: string; answers: Record<string, unknown> }
  assertEquals([row.org_id, row.submitted_by], [ORG, USER])
  assertEquals([row.answers.days, row.answers.total, 'hack' in row.answers], [3, 12.5, false])
})
Deno.test("rejects a file from another user's folder", async () => {
  const { deps } = setup()
  const other = PREFIX.replace(USER, '00000000-0000-0000-0000-0000000000a2') + 'sig.png'
  const res = await submitForm({ formId: FORM_ID, answers: { ...VALID, sig: other } }, deps)
  assertEquals([res.status, res.body.fieldErrors], [400, { sig: 'Sign again.' }])
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `deno test supabase/functions/submit-form`
Expected: `Module not found "…/submit-form/handler.ts"`.

- [ ] **Step 3: Implement the handler** — `supabase/functions/submit-form/handler.ts`

```ts
import { validateAnswers, validateSchema, type Answers, type Field } from '../_shared/forms/index.ts'

export type LoadedForm = { id: string; org_id: string; schema: unknown }
export type Deps = {
  userId(): Promise<string | null>
  /** Caller-scoped read: RLS returns the form only to active members of its org. */
  loadForm(id: string): Promise<LoadedForm | null>
  insert(row: { org_id: string; form_id: string; answers: Answers; submitted_by: string }): Promise<string>
  now(): Date
}
export type Result = { status: number; body: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The authority for a submission: the browser's validation and calculated values are only hints. */
export async function submitForm(body: unknown, deps: Deps): Promise<Result> {
  if (!isObj(body) || typeof body.formId !== 'string' || !UUID.test(body.formId) || !isObj(body.answers)) {
    return { status: 400, body: { error: 'Send a form id and an answers object.' } }
  }
  const userId = await deps.userId()
  if (!userId) return { status: 401, body: { error: 'Sign in again to submit this form.' } }
  const form = await deps.loadForm(body.formId)
  if (!form) return { status: 404, body: { error: 'This form does not exist or you do not have access to it.' } }
  if (validateSchema(form.schema).length) {
    return { status: 409, body: { error: 'This form has a setup problem. Ask a form manager to fix it.' } }
  }
  const checked = validateAnswers(form.schema as Field[], body.answers, { now: deps.now(), filePrefix: `${form.org_id}/${userId}/` })
  if (!checked.ok) return { status: 400, body: { error: 'Some answers need fixing.', fieldErrors: checked.errors } }
  const submissionId = await deps.insert({ org_id: form.org_id, form_id: form.id, answers: checked.answers, submitted_by: userId })
  return { status: 200, body: { submissionId, answers: checked.answers } }
}
```

- [ ] **Step 4: Wire the function** — `supabase/functions/submit-form/index.ts`

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { submitForm } from './handler.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MAX_BODY = 1_000_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const text = await req.text()
  if (text.length > MAX_BODY) return json(413, { error: 'These answers are too large to send.' })
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* body stays null; submitForm answers 400 */ }

  const url = Deno.env.get('SUPABASE_URL')!
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const res = await submitForm(body, {
      userId: async () => (await asCaller.auth.getUser()).data.user?.id ?? null,
      loadForm: async (id) => {
        const { data, error } = await asCaller.from('forms').select('id, org_id, schema').eq('id', id).maybeSingle()
        if (error) throw error
        return data
      },
      insert: async (row) => {
        const { data, error } = await admin.from('form_submissions').insert(row).select('id').single()
        if (error) throw error
        return data.id
      },
      now: () => new Date(),
    })
    return json(res.status, res.body)
  } catch (e) {
    console.error('submit-form failed', e)
    return json(500, { error: 'We could not save your answers. Try again.' })
  }
})
```

- [ ] **Step 5: Run — expect PASS**

Run: `deno test supabase/functions`
Expected: `ok | 50 passed | 0 failed` (6 invite-member + 37 shared + 7 submit-form).

- [ ] **Step 6: Manual check against the local stack** (Review Focus #1)

```bash
supabase functions serve &
ANON=$(supabase status -o json | jq -r .ANON_KEY)
TOKEN=$(curl -s 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"email":"member@alpha.test","password":"password123"}' | jq -r .access_token)
curl -s http://127.0.0.1:54321/functions/v1/submit-form -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"formId":"0000000a-0000-0000-0000-0000000000f1","answers":{"name":"Ada","leave_type":"Annual","start":"2026-10-12","end":"2026-10-14","agree":true,"sig":"0000000a-0000-0000-0000-000000000001/00000000-0000-0000-0000-0000000000a3/sig.png","days":99,"total":9999}}'
```
Expected: `200` with `"days":3,"total":0`. Repeat as `owner@beta.test` → `404`. Without `Authorization` → `401`.

- [ ] **Step 7: README** — in `README.md`, change the functions line and the test list:

```bash
supabase functions serve & # invite-member, submit-form
```
```markdown
- `pnpm test` — unit (incl. the shared form logic in `supabase/functions/_shared/forms`)
- `supabase test db` — RLS, roles, guards, forms and form-file storage
- `deno test supabase/functions` — Edge Functions and the same shared form tests under Deno
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/submit-form/handler.ts supabase/functions/submit-form/index.ts supabase/functions/submit-form/handler.test.ts README.md
git commit -m "feat: add submit-form edge function that revalidates and recomputes answers"
```

---

### Task 5: Design spec for Phase 2 screens

**Owner:** Senior Designer · **Depends on:** — (must be committed before Task 6 starts)

**Files:**
- Create: `docs/superpowers/design/phase-2-screens.md`

**Interfaces:**
- Consumes: `design/README.md`, `design/tokens.css`, `design/components/*` (Canvas, Field, Button, Dialog, DataTable, Menu, Icon), `docs/superpowers/design/phase-1-screens.md` (§0 Global still applies), this plan's Tasks 6–9 code.
- Produces: the spec the frontend engineer follows in Tasks 6–9 wherever it differs from this plan's markup or copy.

- [ ] **Step 1: Write the spec** with these sections, in the format of `phase-1-screens.md` (tables, exact classes/tokens, "DD" for design decisions where the system is silent):
  1. Global additions: nav "Forms" placement, page widths for builder (two columns at `lg`) and fill page (`max-w-2xl`), field error presentation (the shared validator's messages are JS-produced, so `.rnr-error-text`'s `:user-invalid` display does not fire — specify the class and `aria-invalid` / `aria-describedby` pattern to use instead).
  2. Forms list: columns, per-row actions and which is secondary/ghost, the four empty states (first run with and without `forms.manage`, error), delete confirmation copy including the "has submissions" failure.
  3. Builder: layout of name/save bar, "Add a field" control (palette vs select, per Canvas README), field list rows (`rnr-block`, `rnr-handle`, selected state — `aria-selected` is not valid on `<li>`, so confirm the `data-selected` rule Task 8 adds to `src/index.css`), Move up / Move down path, live-region wording for moves, settings panel per field type, show-if editor, formula hint and error, issue list, saved/conflict states, unsaved-changes warning, phone layout (palette as bottom sheet or stacked).
  4. Field inputs for all 12 types, incl. required marker, help text, multi-select as checkbox group, calculated output styling, repeating section rows (add/remove, row labels), page title from `page_break`.
  5. File upload: idle / uploading / uploaded / too large / failed states. Signature pad: size, stroke, the saved PNG background (the plan draws ink on white so the PNG reads in every theme — confirm or change), clear and re-sign, and a non-pointer alternative or an explicit DD that none is offered.
  6. Fill page: page counter, Back / Next page / Submit form, focus on the first error, success state copy and actions, the "setup problem" and "nothing to fill in" states.
  7. Submissions page: title for managers vs members, row summary, answer rendering per type (incl. groups, files, signature image), empty state, the 200-row cap note.
  8. Copy table for every new string, and an accessibility summary (dnd keyboard path, announcements, focus after delete, 44px touch targets, 375px with no horizontal scroll).
  9. Conflicts with Tasks 6–9 and the corrections the frontend must make.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/design/phase-2-screens.md
git commit -m "docs: add phase 2 screen design spec"
```

---

### Task 6: Frontend — routes, nav, forms list

**Owner:** Frontend engineer · **Depends on:** Tasks 1, 3, 5

**Files:**
- Create: `src/forms/logic.ts`, `src/forms/api.ts`, `src/forms/FormGate.tsx`, `src/forms/FormsPage.tsx`
- Modify: `src/rbac/route.ts`, `src/rbac/route.test.ts`, `src/ui/errors.ts`, `src/ui/errors.test.ts`, `src/ui/icons.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `useOrg()` (`orgId`, `can`), `supabase`, `friendlyError`, `useAction`, `useNotice`, `ConfirmDialog`, `Skeleton`, `Field`, `Answers` (Task 1), `forms` table (Task 3), `submit-form` (Task 4 contract).
- Produces:
  - `type Route = { page: 'members' } | { page: 'roles' } | { page: 'forms' } | { page: 'form-edit' | 'form-fill' | 'form-submissions'; id: string }`
  - `parseRoute(hash: string): Route` · `guardHash(hash: string, perms: { roles: boolean; forms: boolean }): string`
  - `type FormRow = { id: string; name: string; schema: Field[]; updated_at: string }` · `type LoadedForm = FormRow & { org_id: string }`
  - `useForms(orgId: string | null)` (key `['forms', orgId]`) · `useForm(id: string)` (key `['form', id]`)
  - `submitAnswers(formId: string, answers: Answers): Promise<{ ok: true; submissionId: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }>`
  - `<FormGate id children={(form: LoadedForm) => ReactNode} />` · `<FormsPage />`
  - Icons: `PlusIcon`, `TrashIcon`, `GripIcon`, `UpIcon`, `DownIcon`, `UploadIcon`, `FileIcon`

- [ ] **Step 1: Write the failing tests**

`src/rbac/route.test.ts` (replace the file):
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardHash, parseRoute } from './route.ts'

const id = '0000000a-0000-0000-0000-0000000000f1'
const all = { roles: true, forms: true }
const none = { roles: false, forms: false }

test('parses every page', () => {
  assert.deepEqual(parseRoute('#/members'), { page: 'members' })
  assert.deepEqual(parseRoute('#/roles'), { page: 'roles' })
  assert.deepEqual(parseRoute('#/forms'), { page: 'forms' })
  assert.deepEqual(parseRoute(`#/forms/${id}/edit`), { page: 'form-edit', id })
  assert.deepEqual(parseRoute(`#/forms/${id}/fill`), { page: 'form-fill', id })
  assert.deepEqual(parseRoute(`#/forms/${id}/submissions`), { page: 'form-submissions', id })
  assert.deepEqual(parseRoute('#/forms/nope/edit'), { page: 'members' })
})
test('roles hash redirects to members without roles.manage', () => {
  assert.equal(guardHash('#/roles', none), '#/members')
  assert.equal(guardHash('#/roles', all), '#/roles')
})
test('the builder falls back to the fill page without forms.manage', () => {
  assert.equal(guardHash(`#/forms/${id}/edit`, none), `#/forms/${id}/fill`)
  assert.equal(guardHash(`#/forms/${id}/edit`, all), `#/forms/${id}/edit`)
  assert.equal(guardHash('#/forms', none), '#/forms')
})
```

Append to `src/ui/errors.test.ts`:
```ts
test('form messages', () => {
  assert.equal(friendlyError({ code: '23503', message: 'update or delete on table "forms" violates foreign key constraint "form_submissions_form_id_org_id_fkey" on table "form_submissions"' }),
    'This form has submissions, so it cannot be deleted.')
  assert.equal(friendlyError({ code: '42501', message: 'new row violates row-level security policy for table "forms"' }),
    'You do not have permission to do that.')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: `parseRoute` not exported; the two form messages return the fallback.

- [ ] **Step 3: Implement routes and messages**

`src/rbac/route.ts` (replace):
```ts
export type Route =
  | { page: 'members' } | { page: 'roles' } | { page: 'forms' }
  | { page: 'form-edit' | 'form-fill' | 'form-submissions'; id: string }

const FORM_PAGE = /^#\/forms\/([0-9a-f-]{36})\/(edit|fill|submissions)$/

export function parseRoute(hash: string): Route {
  if (hash === '#/roles') return { page: 'roles' }
  if (hash === '#/forms') return { page: 'forms' }
  const m = FORM_PAGE.exec(hash)
  if (m) return { page: `form-${m[2]}` as 'form-edit' | 'form-fill' | 'form-submissions', id: m[1] }
  return { page: 'members' }
}

/** Pages the signed-in user may not see fall back to one they can. UI hint only; RLS decides. */
export function guardHash(hash: string, perms: { roles: boolean; forms: boolean }): string {
  const r = parseRoute(hash)
  if (r.page === 'roles' && !perms.roles) return '#/members'
  if (r.page === 'form-edit' && !perms.forms) return `#/forms/${r.id}/fill`
  return hash
}
```

`src/ui/errors.ts` — add as the first two entries of `SENTENCES`:
```ts
  [/on table "form_submissions"/, 'This form has submissions, so it cannot be deleted.'],
  [/row-level security/, 'You do not have permission to do that.'],
```

`src/ui/icons.tsx` — append (paths copied from `design/components/Icon/preview.html`):
```tsx
export const PlusIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M5 12h14M12 5v14" /></svg>
export const TrashIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
export const GripIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" /></svg>
export const UpIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="m18 15-6-6-6 6" /></svg>
export const DownIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="m6 9 6 6 6-6" /></svg>
export const UploadIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M12 3v12M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5" /></svg>
export const FileIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8" /></svg>
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 5: Data layer** — `src/forms/logic.ts`

```ts
// The same module runs inside the submit-form Edge Function; the server's result is the one stored.
export * from '../../supabase/functions/_shared/forms/index.ts'
```

`src/forms/api.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
import { FALLBACK } from '../ui/errors'
import type { Answers, Field } from './logic'

export type FormRow = { id: string; name: string; schema: Field[]; updated_at: string }
export type LoadedForm = FormRow & { org_id: string }

export const useForms = (orgId: string | null) => useQuery({
  queryKey: ['forms', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('forms').select('id, name, schema, updated_at').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as unknown as FormRow[]
  },
})

export const useForm = (id: string) => useQuery({
  queryKey: ['form', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('forms').select('id, org_id, name, schema, updated_at').eq('id', id).maybeSingle()
    if (error) throw error
    return data as unknown as LoadedForm | null
  },
})

export type SubmitResult = { ok: true; submissionId: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** submit-form writes its own user-facing sentences; anything else falls back to the generic one. */
export async function submitAnswers(formId: string, answers: Answers): Promise<SubmitResult> {
  const { data, error } = await supabase.functions.invoke('submit-form', { body: { formId, answers } })
  if (!error) return { ok: true, submissionId: data.submissionId }
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (typeof body?.error === 'string') return { ok: false, error: body.error, fieldErrors: body.fieldErrors }
  }
  return { ok: false, error: FALLBACK }
}
```

`src/forms/FormGate.tsx`:
```tsx
import type { ReactNode } from 'react'
import { useOrg } from '../rbac/useOrg'
import { Skeleton } from '../ui/Skeleton'
import { useForm, type LoadedForm } from './api'

function Notice({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div className="rnr-card gap-3 max-w-xl">
      <h1 className="page-title">{title}</h1>
      <p className="rnr-muted">{body}</p>
      <div>{action}</div>
    </div>
  )
}

/** Loading, error and not-found states shared by the builder, fill and submissions pages. */
export function FormGate({ id, children }: { id: string; children(form: LoadedForm): ReactNode }) {
  const { orgId } = useOrg()
  const form = useForm(id)
  if (form.isPending) return <Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 320 }]} />
  if (form.isError) {
    return <Notice title="We could not load this form" body="Check your connection and try again."
      action={<button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => form.refetch()}>Try again</button>} />
  }
  if (!form.data || form.data.org_id !== orgId) {
    return <Notice title="This form does not exist" body="It may have been deleted, or it belongs to another organisation."
      action={<a className="rnr-btn rnr-btn-secondary" href="#/forms">Back to forms</a>} />
  }
  return <>{children(form.data)}</>
}
```

- [ ] **Step 6: Forms list** — `src/forms/FormsPage.tsx`

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { PlusIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useNotice } from '../ui/useNotice'
import { useForms, type FormRow } from './api'

const fieldCount = (f: FormRow) => f.schema.filter((x) => x.type !== 'page_break').length
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function FormsPage() {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const forms = useForms(orgId)
  const manage = can('forms.manage')
  const create = useAction()
  const removal = useAction()
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<FormRow | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const refresh = () => qc.invalidateQueries({ queryKey: ['forms', orgId] })

  const newForm = () => create.run(async () => {
    setError(null)
    const { data, error } = await supabase.from('forms').insert({ org_id: orgId!, name: 'Untitled form' }).select('id').single()
    if (error) { setError(friendlyError(error)); return }
    await refresh()
    location.hash = `#/forms/${data.id}/edit`
  })

  const confirmRemove = () => removal.run(async () => {
    setRemoveError(null)
    const { data, error } = await supabase.from('forms').delete().eq('id', removing!.id).select('id')
    if (error) { setRemoveError(friendlyError(error)); return }
    if (!data.length) { setRemoveError('You do not have permission to do that.'); return } // RLS turned it into 0 rows
    setRemoving(null); setNotice('Form deleted.'); await refresh()
    document.getElementById('forms-h')?.focus() // the row that opened the dialog is gone
  })

  return (
    <section className="flex flex-col gap-4" aria-labelledby="forms-h">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="forms-h" tabIndex={-1} className="page-title">Forms</h1>
        {manage && (
          <button className="rnr-btn rnr-btn-primary ml-auto" type="button" aria-busy={create.busy} onClick={newForm}>
            {create.busy ? <span className="rnr-spin" aria-hidden="true" /> : <PlusIcon />}{create.busy ? 'Creating…' : 'New form'}
          </button>
        )}
      </div>
      {error && <p className="rnr-error" role="alert">{error}</p>}
      {notice && <p className="rnr-muted" role="status">{notice}</p>}
      {forms.isPending && <Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }, { w: '100%', h: 48 }]} />}
      {forms.isError && (
        <div className="rnr-card gap-3">
          <p>We could not load your forms. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => forms.refetch()}>Try again</button></div>
        </div>
      )}
      {forms.data?.length === 0 && (
        <div className="rnr-card gap-2">
          <h2 className="rnr-card-title">{manage ? 'Build your first form' : 'No forms yet'}</h2>
          <p className="rnr-muted">{manage ? 'Add fields, set rules, and preview it as you go. Members can fill it in once it is saved.' : 'Ask someone who manages forms to build one.'}</p>
        </div>
      )}
      {!!forms.data?.length && (
        <table className="rnr-table">
          <thead><tr><th scope="col">Name</th><th scope="col" className="rnr-num">Fields</th><th scope="col" className="rnr-num">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {forms.data.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td className="rnr-num">{fieldCount(f)}</td>
                <td className="rnr-num">{day(f.updated_at)}</td>
                <td>
                  <div className="flex flex-wrap justify-end gap-1">
                    <a className="rnr-btn rnr-btn-secondary" href={`#/forms/${f.id}/fill`}>Fill in</a>
                    {manage && <a className="rnr-btn rnr-btn-ghost" href={`#/forms/${f.id}/edit`}>Edit</a>}
                    <a className="rnr-btn rnr-btn-ghost" href={`#/forms/${f.id}/submissions`}>Submissions</a>
                    {manage && <button className="rnr-btn rnr-btn-ghost" type="button" onClick={() => { setRemoveError(null); setRemoving(f) }}>Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmDialog open={!!removing} title="Delete this form?" body={`"${removing?.name ?? ''}" will be deleted for everyone. A form that already has submissions cannot be deleted.`}
        confirmLabel="Delete form" busyLabel="Deleting…" busy={removal.busy} error={removeError}
        onConfirm={confirmRemove} onClose={() => setRemoving(null)} />
    </section>
  )
}
```

- [ ] **Step 7: Shell** — `src/App.tsx`

Replace the import of `guardHash` with `import { guardHash, parseRoute, type Route } from './rbac/route'`, add `import { FormsPage } from './forms/FormsPage'`, and add above `Shell`:
```tsx
function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'roles': return <RolesPage />
    case 'forms': return <FormsPage />
    default: return <MembersPage />
  }
}
```
In `Shell`, replace the guard and the `roles` constant:
```tsx
  const hash = loading ? rawHash : guardHash(rawHash, { roles: can('roles.manage'), forms: can('forms.manage') })
```
```tsx
  const route = parseRoute(hash)
```
Replace the nav links:
```tsx
            {link('#/members', 'Members', route.page === 'members')}
            {link('#/forms', 'Forms', route.page.startsWith('form'))}
            {can('roles.manage') && link('#/roles', 'Roles', route.page === 'roles')}
```
Replace the `<main>` body:
```tsx
        <Page key={`${orgId}${hash}`} route={route} />
```
The form-page cases (`form-edit`, `form-fill`, `form-submissions`) are added by Tasks 8, 7 and 9; until then those hashes render Members.

- [ ] **Step 8: Typecheck, lint and browser check**

Run: `pnpm build && pnpm lint`
Expected: no errors, no warnings.

Browser pane, `http://localhost:5173`: as `admin@alpha.test` → Forms nav → "Leave request" listed with 13 fields → New form → lands on `#/forms/<id>/edit` (renders Members until Task 8) → back to Forms → Delete "Untitled form" → "Form deleted.", focus on the Forms heading → Delete "Leave request" after Task 9's submission exists → "This form has submissions, so it cannot be deleted." As `member@alpha.test` → no New form, Edit or Delete; `#/forms/<id>/edit` redirects to `/fill`.

- [ ] **Step 9: Commit**

```bash
git add src/forms/logic.ts src/forms/api.ts src/forms/FormGate.tsx src/forms/FormsPage.tsx src/rbac/route.ts src/rbac/route.test.ts src/ui/errors.ts src/ui/errors.test.ts src/ui/icons.tsx src/App.tsx
git commit -m "feat: add forms list, form routes and nav"
```

---

### Task 7: Frontend — form runner, uploads, fill page

**Owner:** Frontend engineer · **Depends on:** Tasks 2, 6 (live submit needs Task 4)

**Files:**
- Create: `src/forms/paths.ts`, `src/forms/paths.test.ts`, `src/forms/upload.ts`, `src/forms/fill/FieldInput.tsx`, `src/forms/fill/FileInput.tsx`, `src/forms/fill/SignaturePad.tsx`, `src/forms/fill/FormRenderer.tsx`, `src/forms/fill/FormRunner.tsx`, `src/forms/fill/FillPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `pages`, `resolve`, `visiblePages`, `validateAnswers`, `validateSchema`, `evaluate`, `Field`, `Answers`, `Resolved` (Task 2 via `src/forms/logic.ts`); `FormGate`, `submitAnswers`, `SubmitResult` (Task 6); `form-files` bucket (Task 3).
- Produces:
  - `filePath(orgId: string, userId: string, fileName: string, id: string): string`
  - `FILE_BUCKET = 'form-files'` · `uploadFile(orgId, userId, file: Blob, fileName: string): Promise<string>` · `uploadMessage(e: unknown): string`
  - `type Uploader = (file: Blob, name: string) => Promise<string>`
  - `<FieldInput field value onChange error? id upload? />` · `<FormRenderer fields answers resolved errors onChange upload? idPrefix />`
  - `<FormRunner fields idPrefix filePrefix? upload? onSubmit?(answers): Promise<SubmitResult> onDone?(submissionId) />` — without `onSubmit` it is the builder's preview (no uploads, last button checks answers only)
  - `<FillPage id />`

- [ ] **Step 1: Write the failing test** — `src/forms/paths.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filePath } from './paths.ts'

const org = '0000000a-0000-0000-0000-000000000001'
const user = '00000000-0000-0000-0000-0000000000a3'
const id = '11111111-1111-1111-1111-111111111111'

test('builds <org>/<user>/<id>-<safe name>', () => {
  assert.equal(filePath(org, user, 'MC scan (1).pdf', id), `${org}/${user}/${id}-MC-scan-1-.pdf`)
})
test('strips path tricks and keeps the name short', () => {
  assert.equal(filePath(org, user, '../../etc/passwd', id), `${org}/${user}/${id}-..-..-etc-passwd`)
  assert.equal(filePath(org, user, 'ñ.png', id), `${org}/${user}/${id}-n-.png`)
  assert.equal(filePath(org, user, '', id), `${org}/${user}/${id}-file`)
  assert.ok(filePath(org, user, 'a'.repeat(300), id).length <= 36 * 2 + 2 + 37 + 80)
})
test('matches the path rule the server checks', () => {
  assert.match(filePath(org, user, 'x y.pdf', id), /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/)
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test`
Expected: `Cannot find module './paths.ts'`.

- [ ] **Step 3: Implement paths and upload**

`src/forms/paths.ts`:
```ts
/** Storage RLS lets a user write only under <org>/<own user id>/; submit-form checks the same prefix. */
export function filePath(orgId: string, userId: string, fileName: string, id: string): string {
  const safe = fileName.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '').slice(-80) || 'file'
  return `${orgId}/${userId}/${id}-${safe}`
}
```

Check against the tests: `'MC scan (1).pdf'` → `MC-scan-1-.pdf`; `'../../etc/passwd'` → `..-..-etc-passwd`; `'ñ.png'` → NFKD `n` + combining tilde → `n-.png`.

`src/forms/upload.ts`:
```ts
import { supabase } from '../data/supabase'
import { friendlyError } from '../ui/errors'
import { filePath } from './paths'

export const FILE_BUCKET = 'form-files'
const MAX_BYTES = 10 * 1024 * 1024

export async function uploadFile(orgId: string, userId: string, file: Blob, fileName: string): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('too-large')
  const path = filePath(orgId, userId, fileName, crypto.randomUUID())
  const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (error) throw error
  return path
}

export const uploadMessage = (e: unknown) =>
  (e as Error)?.message === 'too-large' ? 'Choose a file under 10 MB.' : friendlyError(e as { message?: string })
```
Shortcut noted in code: `// shortcut: files uploaded but never submitted stay in the bucket; add a cleanup job when storage cost matters.`

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 5: Field inputs**

`src/forms/fill/FileInput.tsx`:
```tsx
import { useState } from 'react'
import { CheckIcon } from '../../ui/icons'
import { useAction } from '../../ui/useAction'
import { uploadMessage } from '../upload'

export type Uploader = (file: Blob, name: string) => Promise<string>
type Props = { id: string; value: unknown; onChange(v: unknown): void; upload?: Uploader; describedBy?: string; invalid: boolean }

export function FileInput({ id, value, onChange, upload, describedBy, invalid }: Props) {
  const action = useAction()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const pick = (file?: File) => {
    if (!file || !upload) return
    action.run(async () => {
      setError(null)
      try { onChange(await upload(file, file.name)); setName(file.name) } catch (e) { setError(uploadMessage(e)) }
    })
  }
  return (
    <>
      <input id={id} type="file" className="rnr-input" aria-describedby={describedBy} aria-invalid={invalid || undefined}
        aria-busy={action.busy} onChange={(e) => pick(e.target.files?.[0])} />
      {!upload && <p className="rnr-muted">Uploads are turned off in the preview.</p>}
      {action.busy && <p className="rnr-muted" role="status"><span className="rnr-spin" aria-hidden="true" />Uploading…</p>}
      {!action.busy && typeof value === 'string' && <p className="rnr-status"><CheckIcon />{name ?? 'File uploaded'}</p>}
      {error && <p className="rnr-error" role="alert">{error}</p>}
    </>
  )
}
```

`src/forms/fill/SignaturePad.tsx`:
```tsx
import { useRef, useState, type PointerEvent } from 'react'
import { CheckIcon } from '../../ui/icons'
import { useAction } from '../../ui/useAction'
import { uploadMessage } from '../upload'
import type { Uploader } from './FileInput'

type Props = { id: string; value: unknown; onChange(v: unknown): void; upload?: Uploader; describedBy?: string }

export function SignaturePad({ id, value, onChange, upload, describedBy }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [drawn, setDrawn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = useAction()

  const pen = () => {
    const g = ref.current!.getContext('2d')!
    g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round'
    g.strokeStyle = '#000' // document ink on a white page, so the PNG reads in every theme
    return g
  }
  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [(e.clientX - r.left) * (e.currentTarget.width / r.width), (e.clientY - r.top) * (e.currentTarget.height / r.height)] as const
  }
  const clear = () => {
    const c = ref.current!
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
    setDrawn(false); onChange(undefined)
  }
  const store = () => save.run(async () => {
    setError(null)
    if (!upload) return
    const blob = await new Promise<Blob | null>((ok) => ref.current!.toBlob(ok, 'image/png'))
    if (!blob) { setError('We could not read your signature. Clear it and sign again.'); return }
    try { onChange(await upload(blob, 'signature.png')) } catch (e) { setError(uploadMessage(e)) }
  })

  return (
    <>
      <canvas id={id} ref={(c) => { if (c && !ref.current) { ref.current = c; clear() } }} width={600} height={160}
        role="img" aria-label="Signature pad. Draw with a mouse, pen or finger." aria-describedby={describedBy}
        className="w-full border border-line-200 rounded-lg touch-none bg-surface-100"
        onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const g = pen(); g.beginPath(); g.moveTo(...at(e)); setDrawn(true) }}
        onPointerMove={(e) => { if (!drawing.current) return; const g = pen(); g.lineTo(...at(e)); g.stroke() }}
        onPointerUp={() => { drawing.current = false }} onPointerCancel={() => { drawing.current = false }} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={save.busy} onClick={() => { if (drawn) store() }}>
          {save.busy && <span className="rnr-spin" aria-hidden="true" />}{save.busy ? 'Saving signature…' : 'Save signature'}
        </button>
        <button type="button" className="rnr-btn rnr-btn-ghost" onClick={clear}>Clear</button>
        {typeof value === 'string' && !save.busy && <span className="rnr-status"><CheckIcon />Signature saved</span>}
        {!upload && <span className="rnr-muted">Signatures are not saved in the preview.</span>}
      </div>
      {error && <p className="rnr-error" role="alert">{error}</p>}
    </>
  )
}
```

`src/forms/fill/FieldInput.tsx`:
```tsx
import type { ReactNode } from 'react'
import type { Field } from '../logic'
import { FileInput, type Uploader } from './FileInput'
import { SignaturePad } from './SignaturePad'

type Props = { field: Field; value: unknown; onChange(v: unknown): void; error?: string; id: string; upload?: Uploader }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function FieldInput({ field: f, value, onChange, error, id, upload }: Props) {
  const helpId = `${id}-help`
  const errId = `${id}-err`
  const describedBy = [f.help ? helpId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined
  const a11y = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': f.required || undefined }
  const label = <>{f.label}{f.required && <span aria-hidden="true"> *</span>}</>
  const tail = <>{f.help && <span id={helpId} className="rnr-hint">{f.help}</span>}</>
  const err = error && <p id={errId} className="rnr-error">{error}</p>
  const wrap = (control: ReactNode) => (
    <div className="rnr-field"><label htmlFor={id} className="rnr-label">{label}</label>{tail}{control}{err}</div>
  )

  switch (f.type) {
    case 'short_text':
      return wrap(<input className="rnr-input" type="text" maxLength={500} value={str(value)} onChange={(e) => onChange(e.target.value)} {...a11y} />)
    case 'long_text':
      return wrap(<textarea className="rnr-input" rows={4} maxLength={10000} value={str(value)} onChange={(e) => onChange(e.target.value)} {...a11y} />)
    case 'number':
      return wrap(<input className="rnr-input rnr-num" type="number" inputMode="decimal" step="any"
        value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)} {...a11y} />)
    case 'date':
      return wrap(<input className="rnr-input" type="date" value={str(value)} onChange={(e) => onChange(e.target.value || undefined)} {...a11y} />)
    case 'single_select':
      return wrap(
        <select className="rnr-input" value={str(value)} onChange={(e) => onChange(e.target.value || undefined)} {...a11y}>
          <option value="">Choose an option</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>,
      )
    case 'multi_select': {
      const picked = Array.isArray(value) ? (value as string[]) : []
      return (
        <fieldset className="rnr-field" aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
          <legend className="rnr-label">{label}</legend>{tail}
          {(f.options ?? []).map((o, i) => (
            <label key={o} className="flex items-center gap-2 text-ink-label min-h-[24px]">
              <input id={i === 0 ? id : undefined} type="checkbox" className="accent-brand" checked={picked.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))} />{o}
            </label>
          ))}
          {err}
        </fieldset>
      )
    }
    case 'checkbox':
      return (
        <div className="rnr-field">
          <label className="flex items-center gap-2 text-ink-label">
            <input type="checkbox" className="accent-brand" checked={value === true} onChange={(e) => onChange(e.target.checked)} {...a11y} />{label}
          </label>
          {tail}{err}
        </div>
      )
    case 'file':
      return wrap(<FileInput id={id} value={value} onChange={onChange} upload={upload} describedBy={describedBy} invalid={!!error} />)
    case 'signature':
      return wrap(<SignaturePad id={id} value={value} onChange={onChange} upload={upload} describedBy={describedBy} />)
    case 'calculated':
      return wrap(<output id={id} className="rnr-input rnr-num" aria-live="polite">{typeof value === 'number' ? value.toLocaleString('en-GB') : '—'}</output>)
    default:
      return null // page_break and group are laid out by FormRenderer
  }
}
```

- [ ] **Step 6: Renderer and runner**

`src/forms/fill/FormRenderer.tsx`:
```tsx
import { evaluate, type Answers, type Field, type Resolved } from '../logic'
import { PlusIcon } from '../../ui/icons'
import { FieldInput } from './FieldInput'
import type { Uploader } from './FileInput'

type Props = {
  fields: Field[]; answers: Answers; resolved: Resolved; errors: Record<string, string>
  onChange(next: Answers): void; upload?: Uploader; idPrefix: string
}

export const inputId = (idPrefix: string, errorKey: string) => `${idPrefix}-${errorKey.replaceAll('.', '-')}`

export function FormRenderer({ fields, answers, resolved, errors, onChange, upload, idPrefix }: Props) {
  const set = (key: string, v: unknown) => onChange({ ...answers, [key]: v })
  return (
    <div className="flex flex-col gap-4">
      {fields.map((f) => {
        if (resolved.hidden.has(f.key)) return null
        if (f.type === 'page_break') return <h2 key={f.key} className="rnr-card-title">{f.label}</h2>
        if (f.type === 'group') {
          const rows = Array.isArray(answers[f.key]) ? (answers[f.key] as Answers[]) : []
          return <GroupInput key={f.key} field={f} rows={rows} answers={answers} errors={errors} upload={upload} idPrefix={idPrefix} onChange={(r) => set(f.key, r)} />
        }
        const value = f.type === 'calculated' ? resolved.answers[f.key] : answers[f.key]
        return <FieldInput key={f.key} id={inputId(idPrefix, f.key)} field={f} value={value} error={errors[f.key]} upload={upload} onChange={(v) => set(f.key, v)} />
      })}
    </div>
  )
}

type GroupProps = { field: Field; rows: Answers[]; answers: Answers; errors: Record<string, string>; upload?: Uploader; idPrefix: string; onChange(rows: Answers[]): void }

function GroupInput({ field: f, rows, answers, errors, upload, idPrefix, onChange }: GroupProps) {
  const { min, max } = f.repeat ?? { min: 0, max: 50 }
  const id = inputId(idPrefix, f.key)
  const noun = f.label.toLowerCase()
  const setRow = (i: number, key: string, v: unknown) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)))
  return (
    <fieldset id={id} tabIndex={-1} className="rnr-card gap-3" aria-describedby={errors[f.key] ? `${id}-err` : undefined}>
      <legend className="rnr-label">{f.label}</legend>
      {f.help && <p className="rnr-hint">{f.help}</p>}
      {rows.map((row, i) => (
        <div key={i} role="group" aria-label={`${f.label} ${i + 1}`} className="flex flex-col gap-3 border-t border-line-200 pt-3">
          {(f.fields ?? []).map((c) => (c.show_if && !evaluate(c.show_if, { ...answers, ...row }) ? null : (
            <FieldInput key={c.key} id={inputId(idPrefix, `${f.key}.${i}.${c.key}`)} field={c} value={row[c.key]}
              error={errors[`${f.key}.${i}.${c.key}`]} upload={upload} onChange={(v) => setRow(i, c.key, v)} />
          )))}
          {rows.length > min && (
            <button type="button" className="rnr-btn rnr-btn-ghost self-start" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              Remove {noun} {i + 1}
            </button>
          )}
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="rnr-btn rnr-btn-secondary self-start" onClick={() => onChange([...rows, {}])}><PlusIcon />Add {noun}</button>
      )}
      {errors[f.key] && <p id={`${id}-err`} className="rnr-error">{errors[f.key]}</p>}
    </fieldset>
  )
}
```

`src/forms/fill/FormRunner.tsx`:
```tsx
import { useMemo, useRef, useState } from 'react'
import { pages, resolve, validateAnswers, visiblePages, type Answers, type Field } from '../logic'
import type { SubmitResult } from '../api'
import { useAction } from '../../ui/useAction'
import { FormRenderer, inputId } from './FormRenderer'
import type { Uploader } from './FileInput'

type Props = {
  fields: Field[]; idPrefix: string; filePrefix?: string; upload?: Uploader
  onSubmit?(answers: Answers): Promise<SubmitResult>; onDone?(submissionId: string): void
}

/** Groups with a minimum start with that many empty rows. */
const seedRows = (fields: Field[]): Answers =>
  Object.fromEntries(fields.filter((f) => f.type === 'group' && (f.repeat?.min ?? 0) > 0).map((f) => [f.key, Array.from({ length: f.repeat!.min }, () => ({}))]))

export function FormRunner({ fields, idPrefix, filePrefix, upload, onSubmit, onDone }: Props) {
  const all = useMemo(() => pages(fields), [fields])
  const [answers, setAnswers] = useState<Answers>(() => seedRows(fields))
  const [at, setAt] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const submit = useAction()
  const top = useRef<HTMLDivElement>(null)
  const resolved = useMemo(() => resolve(fields, answers), [fields, answers])
  const visible = useMemo(() => visiblePages(fields, answers), [fields, answers])

  if (!visible.length) return <p className="rnr-muted">This form has no questions to answer right now.</p>
  const current = Math.min(at, visible.length - 1)
  const page = all[visible[current]]
  const last = current === visible.length - 1

  const showErrors = (errs: Record<string, string>) => {
    setErrors(errs)
    const first = Object.keys(errs)[0] ?? ''
    const root = first.split('.')[0]
    const ix = visible.findIndex((p) => all[p].some((f) => f.key === root))
    if (ix >= 0) setAt(ix)
    requestAnimationFrame(() => document.getElementById(inputId(idPrefix, first))?.focus())
  }
  const next = () => {
    const r = validateAnswers(fields, answers, { onlyKeys: new Set(page.map((f) => f.key)), filePrefix })
    if (!r.ok) return showErrors(r.errors)
    setErrors({}); setAt(current + 1)
    requestAnimationFrame(() => top.current?.focus())
  }
  const finish = () => submit.run(async () => {
    setFormError(null); setChecked(false)
    const r = validateAnswers(fields, answers, { filePrefix })
    if (!r.ok) return showErrors(r.errors)
    setErrors({})
    if (!onSubmit) { setChecked(true); return }
    const res = await onSubmit(answers)
    if (!res.ok) { setFormError(res.error); if (res.fieldErrors) showErrors(res.fieldErrors); return }
    onDone?.(res.submissionId)
  })

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (last) finish(); else next() }}>
      <div ref={top} tabIndex={-1}>{visible.length > 1 && <p className="rnr-muted">Page {current + 1} of {visible.length}</p>}</div>
      <FormRenderer fields={page} answers={answers} resolved={resolved} errors={errors} onChange={(a) => { setAnswers(a); setChecked(false) }} upload={upload} idPrefix={idPrefix} />
      {formError && <p className="rnr-error" role="alert">{formError}</p>}
      {checked && <p className="rnr-muted" role="status">These answers are valid. The preview does not save them.</p>}
      <div className="flex gap-2">
        {current > 0 && <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => { setErrors({}); setAt(current - 1) }}>Back</button>}
        <button type="submit" className={`rnr-btn ${onSubmit ? 'rnr-btn-primary' : 'rnr-btn-secondary'}`} aria-busy={submit.busy}>
          {submit.busy && <span className="rnr-spin" aria-hidden="true" />}
          {!last ? 'Next page' : !onSubmit ? 'Check answers' : submit.busy ? 'Submitting…' : 'Submit form'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 7: Fill page** — `src/forms/fill/FillPage.tsx`

```tsx
import { useRef, useState } from 'react'
import { useOrg } from '../../rbac/useOrg'
import { validateSchema } from '../logic'
import { submitAnswers, type LoadedForm } from '../api'
import { FormGate } from '../FormGate'
import { uploadFile } from '../upload'
import { FormRunner } from './FormRunner'

function Fill({ form }: { form: LoadedForm }) {
  const { userId } = useOrg()
  const [done, setDone] = useState(false)
  const [round, setRound] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const broken = validateSchema(form.schema).length > 0
  return (
    <section className="flex flex-col gap-4 max-w-2xl" aria-labelledby="fill-h">
      <h1 id="fill-h" ref={heading} tabIndex={-1} className="page-title">{form.name}</h1>
      {broken && <p className="rnr-error" role="alert">This form has a setup problem. Ask a form manager to fix it.</p>}
      {!broken && done && (
        <div className="rnr-card gap-3" role="status">
          <p>Form submitted.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rnr-btn rnr-btn-primary" onClick={() => { setDone(false); setRound(round + 1) }}>Fill in again</button>
            <a className="rnr-btn rnr-btn-ghost" href={`#/forms/${form.id}/submissions`}>View submissions</a>
          </div>
        </div>
      )}
      {!broken && !done && (
        <FormRunner key={round} fields={form.schema} idPrefix="fill" filePrefix={`${form.org_id}/${userId}/`}
          upload={(blob, name) => uploadFile(form.org_id, userId, blob, name)}
          onSubmit={(answers) => submitAnswers(form.id, answers)}
          onDone={() => { setDone(true); requestAnimationFrame(() => heading.current?.focus()) }} />
      )}
    </section>
  )
}

export function FillPage({ id }: { id: string }) {
  return <FormGate id={id}>{(form) => <Fill form={form} />}</FormGate>
}
```

`src/App.tsx` — import `FillPage` from `./forms/fill/FillPage` and add to `Page`:
```tsx
    case 'form-fill': return <FillPage id={route.id} />
```

- [ ] **Step 8: Typecheck, lint and browser check** (Claude Browser pane, `supabase functions serve` running)

Run: `pnpm build && pnpm lint`
Expected: no errors, no warnings.

As `member@alpha.test`, Forms → Leave request → Fill in:
1. Next page with nothing filled → "This field is required." under Full name and Leave type; focus on Full name.
2. Leave type Medical → Medical certificate appears; upload a 12 MB file → "Choose a file under 10 MB."; upload a small PDF → "File uploaded" status. Switch to Other → certificate hides, Other reason appears.
3. Page 2: First day 2026-10-12, Last day 2026-10-14 → Days shows 3.
4. Page 3: Add claims → two rows, amounts 12.5 and 7 → Total claimed 19.5; Add claims is gone after 3 rows.
5. Leave the box unticked, draw and save a signature → Submit form → focus on the checkbox with "Tick this box to continue." → tick → Submit form → "Form submitted.", focus on the heading.
6. At 375px wide: no horizontal page scroll; the signature pad fills the width and draws with touch emulation.

- [ ] **Step 9: Commit**

```bash
git add src/forms/paths.ts src/forms/paths.test.ts src/forms/upload.ts src/forms/fill src/App.tsx
git commit -m "feat: add form runner with uploads, signatures, paging and submit"
```

---

### Task 8: Frontend — builder with drag-to-reorder and live preview

**Owner:** Frontend engineer · **Depends on:** Task 7

**Files:**
- Create: `src/forms/builder/builderOps.ts`, `src/forms/builder/builderOps.test.ts`, `src/forms/builder/DraftInput.tsx`, `src/forms/builder/FieldList.tsx`, `src/forms/builder/RuleEditor.tsx`, `src/forms/builder/FieldSettings.tsx`, `src/forms/builder/FormBuilder.tsx`
- Modify: `package.json`, `pnpm-lock.yaml`, `src/index.css`, `src/App.tsx`

**Interfaces:**
- Consumes: `FIELD_TYPES`, `OPERATORS`, `SECTION_FIELD_TYPES`, `KEY_RE`, `compile`, `validateSchema`, `SchemaIssue`, `Field`, `FieldType`, `Operator`, `Rule` (Tasks 1–2); `FormGate`, `LoadedForm` (Task 6); `FormRunner` (Task 7); `useAction`, `friendlyError`; `Json` from `src/data/database.types.ts`.
- Produces:
  - `TYPE_LABELS: Record<FieldType, string>` · `uniqueKey(base: string, taken: Iterable<string>): string` · `newField(type: FieldType, taken: Iterable<string>): Field` · `move<T>(list: T[], from: number, to: number): T[]`
  - `rulePaths(scope: Field[], self: string): { value: string; label: string }[]` · `valueText(v: unknown): string` · `parseValue(op: Operator, text: string): unknown`
  - `<FormBuilder id />`

- [ ] **Step 1: Add the drag-and-drop packages**

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Write the failing test** — `src/forms/builder/builderOps.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FIELD_TYPES, validateSchema, type Field } from '../logic.ts'
import { move, newField, parseValue, rulePaths, uniqueKey, valueText } from './builderOps.ts'

test('uniqueKey skips taken keys', () => {
  assert.equal(uniqueKey('number', []), 'number_1')
  assert.equal(uniqueKey('number', ['number_1', 'number_2']), 'number_3')
})
test('every new field type is valid on its own', () => {
  for (const t of FIELD_TYPES) assert.deepEqual(validateSchema([newField(t, [])]), [], t)
})
test('move reorders without mutating and ignores out-of-range moves', () => {
  const list = ['a', 'b', 'c']
  assert.deepEqual(move(list, 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(move(list, 2, 0), ['c', 'a', 'b'])
  assert.equal(move(list, 0, 3), list)
  assert.deepEqual(list, ['a', 'b', 'c'])
})
test('rulePaths offers fields, section columns and row counts, never the field itself or page breaks', () => {
  const scope = [
    { key: 'a', type: 'number', label: 'Age' },
    { key: 'p', type: 'page_break', label: 'P' },
    { key: 'kids', type: 'group', label: 'Children', repeat: { min: 0, max: 3 }, fields: [{ key: 'name', type: 'short_text', label: 'Name' }] },
    { key: 'me', type: 'number', label: 'Me' },
  ] as Field[]
  assert.deepEqual(rulePaths(scope, 'me').map((p) => p.value), ['a', 'kids.count', 'kids[].name'])
  assert.equal(rulePaths(scope, 'me')[2].label, 'Children: Name (any row)')
})
test('rule values round-trip through text', () => {
  assert.deepEqual(parseValue('is_one_of', 'a, b ,, c'), ['a', 'b', 'c'])
  assert.equal(parseValue('within_days', '7'), 7)
  assert.equal(parseValue('within_days', ' '), undefined)
  assert.equal(parseValue('is', 'Other'), 'Other')
  assert.equal(valueText(['a', 'b']), 'a, b')
  assert.equal(valueText(undefined), '')
})
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm test`
Expected: `Cannot find module './builderOps.ts'`.

- [ ] **Step 4: Implement** — `src/forms/builder/builderOps.ts`

```ts
import type { Field, FieldType, Operator } from '../logic'

export const TYPE_LABELS: Record<FieldType, string> = {
  short_text: 'Short text', long_text: 'Long text', number: 'Number', date: 'Date',
  single_select: 'Single select', multi_select: 'Multi select', checkbox: 'Checkbox', file: 'File upload',
  signature: 'Signature', page_break: 'Page break', group: 'Repeating section', calculated: 'Calculated',
}

export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = 1; ; n++) {
    const key = `${base.slice(0, 36)}_${n}`
    if (!used.has(key)) return key
  }
}

export function newField(type: FieldType, taken: Iterable<string>): Field {
  const key = uniqueKey(type, taken)
  const label = TYPE_LABELS[type]
  if (type === 'page_break') return { key, type, label: 'New page' }
  if (type === 'single_select' || type === 'multi_select') return { key, type, label, options: ['Option 1', 'Option 2'] }
  if (type === 'group') return { key, type, label, repeat: { min: 0, max: 5 }, fields: [{ key: 'item_1', type: 'short_text', label: 'Item' }] }
  if (type === 'calculated') return { key, type, label, expression: '0' }
  return { key, type, label }
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function rulePaths(scope: Field[], self: string): { value: string; label: string }[] {
  return scope.filter((f) => f.key !== self && f.type !== 'page_break').flatMap((f) => (f.type === 'group'
    ? [
      { value: `${f.key}.count`, label: `${f.label}: number of rows` },
      ...(f.fields ?? []).map((c) => ({ value: `${f.key}[].${c.key}`, label: `${f.label}: ${c.label} (any row)` })),
    ]
    : [{ value: f.key, label: f.label }]))
}

export const valueText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v))

export function parseValue(op: Operator, text: string): unknown {
  if (op === 'is_one_of') return text.split(',').map((s) => s.trim()).filter(Boolean)
  if (op === 'within_days') return text.trim() === '' ? undefined : Number(text)
  return text
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit-on-blur input** — `src/forms/builder/DraftInput.tsx` (keys, options and rule values are committed whole, so half-typed text never becomes a broken schema; the parent re-keys it when the stored value changes)

```tsx
import { useId, useState, type ChangeEvent } from 'react'

type Props = { label: string; value: string; hint?: string; error?: string | null; multiline?: boolean; onCommit(text: string): void }

export function DraftInput({ label, value, hint, error, multiline, onCommit }: Props) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const props = {
    id, className: 'rnr-input', value: draft,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: () => { if (draft !== value) onCommit(draft) },
  }
  return (
    <div className="rnr-field">
      <label htmlFor={id} className="rnr-label">{label}</label>
      {hint && <span id={`${id}-hint`} className="rnr-hint">{hint}</span>}
      {multiline ? <textarea rows={4} {...props} /> : <input {...props} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />}
      {error && <p id={`${id}-err`} className="rnr-error">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 7: Sortable field list** — `src/forms/builder/FieldList.tsx`

```tsx
import { useId, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Field, FieldType } from '../logic'
import { DownIcon, GripIcon, UpIcon } from '../../ui/icons'
import { TYPE_LABELS } from './builderOps'

type ListProps = { label: string; fields: Field[]; selected: string | null; issues: ReadonlySet<string>; onSelect(key: string): void; onMove(from: number, to: number): void }

export function FieldList({ label, fields, selected, issues, onSelect, onMove }: ListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [said, say] = useState('')
  const nameOf = (id: UniqueIdentifier) => fields.find((f) => f.key === id)?.label || 'Field'
  const posOf = (id: UniqueIdentifier) => fields.findIndex((f) => f.key === id) + 1
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onMove(fields.findIndex((f) => f.key === active.id), fields.findIndex((f) => f.key === over.id))
  }
  const step = (i: number, d: -1 | 1) => {
    onMove(i, i + d)
    say(`${fields[i].label || TYPE_LABELS[fields[i].type]} moved to position ${i + d + 1} of ${fields.length}.`)
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
      accessibility={{ announcements: {
        onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}. Use the arrow keys to move it, Space to drop it.`,
        onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over position ${posOf(over.id)} of ${fields.length}.` : undefined),
        onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} moved to position ${posOf(over.id)} of ${fields.length}.` : `${nameOf(active.id)} dropped.`),
        onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
      } }}>
      <SortableContext items={fields.map((f) => f.key)} strategy={verticalListSortingStrategy}>
        <ol aria-label={label} className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <Row key={f.key} field={f} index={i} count={fields.length} selected={selected === f.key} hasIssue={issues.has(f.key)} onSelect={onSelect} onStep={step} />
          ))}
        </ol>
      </SortableContext>
      <p className="sr-only" aria-live="polite">{said}</p>
    </DndContext>
  )
}

type RowProps = { field: Field; index: number; count: number; selected: boolean; hasIssue: boolean; onSelect(key: string): void; onStep(i: number, d: -1 | 1): void }

function Row({ field: f, index, count, selected, hasIssue, onSelect, onStep }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: f.key })
  const name = f.label || TYPE_LABELS[f.type]
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="rnr-block" data-selected={selected}>
      <button ref={setActivatorNodeRef} type="button" className="rnr-handle" aria-label={`Drag ${name}`} {...attributes} {...listeners}><GripIcon /></button>
      <button type="button" className="flex-1 text-left" aria-pressed={selected} onClick={() => onSelect(f.key)}>
        <span className="block font-medium">{name}</span>
        <span className="rnr-muted">{TYPE_LABELS[f.type]}{f.required ? ' · Required' : ''}{hasIssue ? ' · Needs fixing' : ''}</span>
      </button>
      {index > 0 && <button type="button" className="rnr-icon-btn" aria-label={`Move ${name} up`} onClick={() => onStep(index, -1)}><UpIcon size={14} /></button>}
      {index < count - 1 && <button type="button" className="rnr-icon-btn" aria-label={`Move ${name} down`} onClick={() => onStep(index, 1)}><DownIcon size={14} /></button>}
    </li>
  )
}

export function AddField({ types, label, onAdd }: { types: readonly FieldType[]; label: string; onAdd(t: FieldType): void }) {
  const id = useId()
  return (
    <div className="rnr-field">
      <label htmlFor={id} className="rnr-label">{label}</label>
      <select id={id} className="rnr-input" value="" onChange={(e) => { if (e.target.value) onAdd(e.target.value as FieldType) }}>
        <option value="">Choose a field type</option>
        {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
      </select>
    </div>
  )
}
```

`src/index.css` — append (the selected style from `bundle.css`, keyed off a data attribute because `aria-selected` is not valid on a list item):
```css
.rnr-block[data-selected="true"] { border-color: var(--focus-ring); box-shadow: 0 0 0 1px var(--focus-ring); }
```

- [ ] **Step 8: Rule editor and field settings**

`src/forms/builder/RuleEditor.tsx`:
```tsx
import { OPERATORS, type Field, type Operator, type Rule } from '../logic'
import { DraftInput } from './DraftInput'
import { parseValue, rulePaths, valueText } from './builderOps'

const OP_LABELS: Record<Operator, string> = {
  is: 'is', is_not: 'is not', is_one_of: 'is one of', contains: 'contains', is_empty: 'is empty',
  is_not_empty: 'is not empty', gt: 'is more than', lt: 'is less than', within_days: 'is within this many days of today',
}

type Props = { rule?: Rule; scope: Field[]; self: string; onChange(rule?: Rule): void }

export function RuleEditor({ rule, scope, self, onChange }: Props) {
  const paths = rulePaths(scope, self)
  return (
    <fieldset className="rnr-field">
      <legend className="rnr-label">Show this field</legend>
      <label className="flex items-center gap-2 text-ink-label">
        <input type="checkbox" className="accent-brand" checked={!!rule}
          onChange={(e) => onChange(e.target.checked ? { field: paths[0]?.value ?? '', operator: 'is_not_empty' } : undefined)} />
        Only when a condition is met
      </label>
      {rule && (
        <div className="grid gap-2 sm:grid-cols-3">
          <select aria-label="Field to check" className="rnr-input" value={rule.field} onChange={(e) => onChange({ ...rule, field: e.target.value })}>
            {paths.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select aria-label="Condition" className="rnr-input" value={rule.operator}
            onChange={(e) => onChange({ field: rule.field, operator: e.target.value as Operator })}>
            {OPERATORS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
          </select>
          {rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty' && (
            <DraftInput key={`${rule.operator}:${valueText(rule.value)}`} label="Value"
              hint={rule.operator === 'is_one_of' ? 'Separate values with commas.' : undefined}
              value={valueText(rule.value)} onCommit={(t) => onChange({ ...rule, value: parseValue(rule.operator, t) })} />
          )}
        </div>
      )}
    </fieldset>
  )
}
```

`src/forms/builder/FieldSettings.tsx`:
```tsx
import { useId, useState } from 'react'
import { KEY_RE, compile, type Field, type SchemaIssue } from '../logic'
import { DraftInput } from './DraftInput'
import { RuleEditor } from './RuleEditor'
import { TYPE_LABELS } from './builderOps'

type Props = { field: Field; scope: Field[]; taken: string[]; issues: SchemaIssue[]; onChange(f: Field): void; onRemove(): void }

export function FieldSettings({ field: f, scope, taken, issues, onChange, onRemove }: Props) {
  const uid = useId()
  const [keyError, setKeyError] = useState<string | null>(null)
  const set = (patch: Partial<Field>) => onChange({ ...f, ...patch })
  const formula = f.type === 'calculated' ? compile(f.expression ?? '') : null
  const commitKey = (k: string) => {
    if (!KEY_RE.test(k)) return setKeyError('Use lowercase letters, numbers and underscores, starting with a letter.')
    if (taken.includes(k)) return setKeyError('Another field already uses this key.')
    setKeyError(null)
    set({ key: k })
  }
  return (
    <section aria-labelledby={`${uid}-h`} className="rnr-card gap-3">
      <h2 id={`${uid}-h`} className="rnr-card-title">{TYPE_LABELS[f.type]} settings</h2>
      {issues.length > 0 && <ul className="rnr-error" role="alert">{issues.map((i) => <li key={i.message}>{i.message}</li>)}</ul>}
      <div className="rnr-field">
        <label htmlFor={`${uid}-label`} className="rnr-label">{f.type === 'page_break' ? 'Page title' : 'Label'}</label>
        <input id={`${uid}-label`} className="rnr-input" maxLength={200} value={f.label ?? ''} onChange={(e) => set({ label: e.target.value })} />
      </div>
      <DraftInput key={`key:${f.key}`} label="Key" hint="Used in rules and formulas." value={f.key} error={keyError} onCommit={commitKey} />
      {f.type !== 'page_break' && (
        <div className="rnr-field">
          <label htmlFor={`${uid}-help`} className="rnr-label">Help text</label>
          <textarea id={`${uid}-help`} className="rnr-input" rows={2} maxLength={500} value={f.help ?? ''} onChange={(e) => set({ help: e.target.value || undefined })} />
        </div>
      )}
      {f.type !== 'page_break' && f.type !== 'calculated' && (
        <label className="flex items-center gap-2 text-ink-label">
          <input type="checkbox" className="accent-brand" checked={!!f.required} onChange={(e) => set({ required: e.target.checked || undefined })} />Required
        </label>
      )}
      {(f.type === 'single_select' || f.type === 'multi_select') && (
        <DraftInput key={`opt:${(f.options ?? []).join('\n')}`} multiline label="Options" hint="One option per line."
          value={(f.options ?? []).join('\n')} onCommit={(t) => set({ options: t.split('\n').map((s) => s.trim()).filter(Boolean) })} />
      )}
      {f.type === 'group' && (
        <div className="grid grid-cols-2 gap-3">
          {(['min', 'max'] as const).map((k) => (
            <div key={k} className="rnr-field">
              <label htmlFor={`${uid}-${k}`} className="rnr-label">{k === 'min' ? 'Fewest rows' : 'Most rows'}</label>
              <input id={`${uid}-${k}`} className="rnr-input rnr-num" type="number" min={0} max={50} step={1}
                value={f.repeat?.[k] ?? ''} onChange={(e) => set({ repeat: { min: 0, max: 5, ...f.repeat, [k]: e.target.valueAsNumber } })} />
            </div>
          ))}
        </div>
      )}
      {f.type === 'calculated' && (
        <div className="rnr-field">
          <label htmlFor={`${uid}-expr`} className="rnr-label">Formula</label>
          <span id={`${uid}-expr-hint`} className="rnr-hint">Use + − × ÷, brackets, field keys, and sum, count, min, max, days_between, round, if. Example: days_between(start, end) + 1</span>
          <input id={`${uid}-expr`} className="rnr-input" maxLength={500} value={f.expression ?? ''} aria-describedby={`${uid}-expr-hint`}
            aria-invalid={formula && !formula.ok ? true : undefined} onChange={(e) => set({ expression: e.target.value })} />
          {formula && !formula.ok && <p className="rnr-error">{formula.error}</p>}
        </div>
      )}
      {f.type !== 'page_break' && <RuleEditor rule={f.show_if} scope={scope} self={f.key} onChange={(show_if) => set({ show_if })} />}
      <div><button type="button" className="rnr-btn rnr-btn-ghost" onClick={onRemove}>Remove field</button></div>
    </section>
  )
}
```

- [ ] **Step 9: Builder** — `src/forms/builder/FormBuilder.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../data/supabase'
import type { Json } from '../../data/database.types'
import { friendlyError } from '../../ui/errors'
import { CheckIcon } from '../../ui/icons'
import { useAction } from '../../ui/useAction'
import { FIELD_TYPES, SECTION_FIELD_TYPES, validateSchema, type Field, type FieldType } from '../logic'
import type { LoadedForm } from '../api'
import { FormGate } from '../FormGate'
import { FormRunner } from '../fill/FormRunner'
import { AddField, FieldList } from './FieldList'
import { FieldSettings } from './FieldSettings'
import { move, newField } from './builderOps'

type Sel = { key: string; child?: string } | null

function Builder({ form }: { form: LoadedForm }) {
  const qc = useQueryClient()
  const [name, setName] = useState(form.name)
  const [fields, setFields] = useState<Field[]>(form.schema)
  const [saved, setSaved] = useState({ name: form.name, fields: form.schema, version: form.updated_at })
  const [sel, setSel] = useState<Sel>(form.schema[0] ? { key: form.schema[0].key } : null)
  const [error, setError] = useState<string | null>(null)
  const save = useAction()
  const issues = useMemo(() => validateSchema(fields), [fields])
  const issueRoots = useMemo(() => new Set(issues.map((i) => i.key.split('.')[0])), [issues])
  const dirty = name !== saved.name || fields !== saved.fields

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [dirty])

  const top = sel ? fields.find((f) => f.key === sel.key) : undefined
  const child = top && sel?.child ? top.fields?.find((c) => c.key === sel.child) : undefined
  const replace = (key: string, next: Field) => setFields(fields.map((f) => (f.key === key ? next : f)))
  const add = (type: FieldType) => {
    const f = newField(type, fields.map((x) => x.key))
    setFields([...fields, f]); setSel({ key: f.key })
  }

  const onSave = () => save.run(async () => {
    setError(null)
    if (!name.trim()) { setError('Give the form a name.'); document.getElementById('form-name')?.focus(); return false }
    if (issues.length) {
      setError(`Fix ${issues.length} ${issues.length === 1 ? 'problem' : 'problems'} before saving. Fields that need fixing are marked in the list.`)
      const [root, kid] = issues[0].key.split('.')
      if (root) setSel(kid ? { key: root, child: kid } : { key: root })
      return false
    }
    const { data, error } = await supabase.from('forms').update({ name: name.trim(), schema: fields as unknown as Json })
      .eq('id', form.id).eq('updated_at', saved.version).select('updated_at')
    if (error) { setError(friendlyError(error)); return false }
    if (!data.length) { setError('Someone else changed this form, or you no longer have access. Reload the page to see the latest version.'); return false }
    setSaved({ name: name.trim(), fields, version: data[0].updated_at }); setName(name.trim())
    await qc.invalidateQueries({ queryKey: ['forms'] })
    return true
  }, true)

  return (
    <section aria-labelledby="builder-h" className="flex flex-col gap-4">
      <h1 id="builder-h" className="page-title">Edit form</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="rnr-field flex-1 min-w-[240px]">
          <label htmlFor="form-name" className="rnr-label">Form name</label>
          <input id="form-name" className="rnr-input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <a className="rnr-btn rnr-btn-ghost" href={`#/forms/${form.id}/fill`}>Open form</a>
        <button type="button" className="rnr-btn rnr-btn-primary" aria-busy={save.busy} onClick={onSave}>
          {save.busy ? <><span className="rnr-spin" aria-hidden="true" />Saving…</> : save.saved ? <><CheckIcon />Saved</> : 'Save form'}
        </button>
      </div>
      {error && <p className="rnr-error" role="alert">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 min-w-0">
          <AddField types={FIELD_TYPES} label="Add a field" onAdd={add} />
          {fields.length
            ? <FieldList label="Fields" fields={fields} selected={sel?.key ?? null} issues={issueRoots}
                onSelect={(key) => setSel({ key })} onMove={(a, b) => setFields(move(fields, a, b))} />
            : <div className="rnr-drop">Add your first field from the list above.</div>}
          {top && (
            <FieldSettings key={top.key} field={top} scope={fields} taken={fields.map((f) => f.key).filter((k) => k !== top.key)}
              issues={issues.filter((i) => i.key === top.key)}
              onChange={(f) => { replace(top.key, f); setSel({ key: f.key }) }}
              onRemove={() => { setFields(fields.filter((f) => f.key !== top.key)); setSel(null) }} />
          )}
          {top?.type === 'group' && (
            <div className="rnr-card gap-3">
              <h2 className="rnr-card-title">Fields in {top.label}</h2>
              <FieldList label={`Fields in ${top.label}`} fields={top.fields ?? []} selected={sel?.child ?? null}
                issues={new Set(issues.filter((i) => i.key.startsWith(`${top.key}.`)).map((i) => i.key.split('.')[1]))}
                onSelect={(c) => setSel({ key: top.key, child: c })}
                onMove={(a, b) => replace(top.key, { ...top, fields: move(top.fields ?? [], a, b) })} />
              <AddField types={SECTION_FIELD_TYPES} label="Add a field to this section" onAdd={(t) => {
                const f = newField(t, (top.fields ?? []).map((c) => c.key))
                replace(top.key, { ...top, fields: [...(top.fields ?? []), f] }); setSel({ key: top.key, child: f.key })
              }} />
            </div>
          )}
          {top && child && (
            <FieldSettings key={`${top.key}.${child.key}`} field={child} scope={[...fields, ...(top.fields ?? [])]}
              taken={(top.fields ?? []).map((c) => c.key).filter((k) => k !== child.key)}
              issues={issues.filter((i) => i.key === `${top.key}.${child.key}`)}
              onChange={(c) => { replace(top.key, { ...top, fields: (top.fields ?? []).map((x) => (x.key === child.key ? c : x)) }); setSel({ key: top.key, child: c.key }) }}
              onRemove={() => { replace(top.key, { ...top, fields: (top.fields ?? []).filter((x) => x.key !== child.key) }); setSel({ key: top.key }) }} />
          )}
        </div>
        <aside aria-labelledby="preview-h" className="rnr-card gap-3 min-w-0">
          <h2 id="preview-h" className="rnr-card-title">Preview</h2>
          <FormRunner fields={fields} idPrefix="preview" />
        </aside>
      </div>
    </section>
  )
}

export function FormBuilder({ id }: { id: string }) {
  return <FormGate id={id}>{(form) => <Builder form={form} />}</FormGate>
}
```

`src/App.tsx` — import `FormBuilder` from `./forms/builder/FormBuilder` and add to `Page`:
```tsx
    case 'form-edit': return <FormBuilder id={route.id} />
```

- [ ] **Step 10: Typecheck, lint and browser check**

Run: `pnpm build && pnpm lint`
Expected: no errors, no warnings.

As `admin@alpha.test`, Forms → New form:
1. Add Short text, Number, Single select, Calculated → the preview shows each as it is added.
2. Drag Calculated above Number with the mouse → list and preview reorder; Tab to its grip, Space, ↑, Space → the live region reads "… moved to position 1 of 4."; Move down button does the same without dragging.
3. Calculated formula `number_1 * 2` while it sits above Number → "Needs fixing" on the row and the issue "\"number_1\" must be a field above this one."; Save form → "Fix 1 problem before saving…" and the field is selected. Move it below Number → issue clears; type 4 in the preview's Number → Calculated shows 8.
4. Key of Number → `short_text_1` → "Another field already uses this key." and the key is not changed.
5. Show-if on Single select: Short text is not empty → preview hides it until Short text has a value.
6. Add Repeating section, add Date inside it, Fewest rows 3 / Most rows 2 → issue shown; fix → preview shows Add repeating section.
7. Save form → "Saved" for 1.6s. In a second tab, rename and save the same form; back in the first tab, change and save → "Someone else changed this form…".
8. Edit something and close the tab → the browser's leave-page warning appears.
9. 375px wide: preview stacks below the list, no horizontal page scroll; the grip and arrow buttons are at least 44px on touch emulation.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml src/index.css src/forms/builder src/App.tsx
git commit -m "feat: add form builder with drag-to-reorder and live preview"
```

---

### Task 9: Frontend — submissions page and end-to-end check

**Owner:** Frontend engineer · **Depends on:** Tasks 4, 7

**Files:**
- Create: `src/forms/submissions/SubmissionsPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `form_submissions` (Task 3: own rows, or all with `forms.manage`), `members` (`user_id`, `email`), `FILE_BUCKET` (Task 7), `FormGate`, `LoadedForm` (Task 6), `useOrg().can`.
- Produces: `<SubmissionsPage id />`; query keys `['submissions', formId]`, `['member-emails', orgId]`, `['signed', path]` (distinct from Phase 1's `['members', orgId]`, which has another `select` shape).

- [ ] **Step 1: Implement** — `src/forms/submissions/SubmissionsPage.tsx`

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../data/supabase'
import { useOrg } from '../../rbac/useOrg'
import { Skeleton } from '../../ui/Skeleton'
import type { Answers, Field } from '../logic'
import type { LoadedForm } from '../api'
import { FormGate } from '../FormGate'
import { FILE_BUCKET } from '../upload'

type Sub = { id: string; answers: Answers; submitted_by: string; created_at: string }
const LIMIT = 200 // shortcut: newest 200 only; paging arrives with aggregate reports (Phase 5)
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function FileLink({ path, image }: { path: string; image: boolean }) {
  const url = useQuery({ queryKey: ['signed', path], staleTime: 50 * 60_000, queryFn: async () => {
    const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(path, 3600)
    if (error) throw error
    return data.signedUrl
  } })
  if (url.isPending) return <span className="rnr-muted">Loading…</span>
  if (url.isError) return <span className="rnr-error">We could not open this file. Reload the page to try again.</span>
  return image
    ? <img src={url.data} alt="Signature" className="h-16 bg-surface-100 border border-line-200 rounded-lg" />
    : <a href={url.data} target="_blank" rel="noopener noreferrer">Open file</a>
}

function Value({ field: f, value }: { field: Field; value: unknown }) {
  if (value === undefined || value === null || value === '') return <span className="rnr-muted">Not answered</span>
  if (f.type === 'checkbox') return <>{value ? 'Yes' : 'No'}</>
  if (f.type === 'multi_select' && Array.isArray(value)) return <>{value.join(', ')}</>
  if ((f.type === 'file' || f.type === 'signature') && typeof value === 'string') return <FileLink path={value} image={f.type === 'signature'} />
  if (f.type === 'number' || f.type === 'calculated') return <span className="rnr-num">{Number(value).toLocaleString('en-GB')}</span>
  if (f.type === 'group' && Array.isArray(value)) {
    return (
      <ol className="flex flex-col gap-2">
        {(value as Answers[]).map((row, i) => (
          <li key={i}><dl className="grid grid-cols-[auto_1fr] gap-x-3">
            {(f.fields ?? []).map((c) => <Pair key={c.key} label={c.label}><Value field={c} value={row[c.key]} /></Pair>)}
          </dl></li>
        ))}
      </ol>
    )
  }
  return <>{String(value)}</>
}

const Pair = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <><dt className="text-ink-label font-medium">{label}</dt><dd>{children}</dd></>
)

function Row({ sub, fields, by }: { sub: Sub; fields: Field[]; by: string }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="rnr-card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer"><span className="font-medium">{by}</span> · <span className="rnr-muted">{when(sub.created_at)}</span></summary>
      {open && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 pt-3">
          {fields.filter((f) => f.type !== 'page_break').map((f) => <Pair key={f.key} label={f.label}><Value field={f} value={sub.answers[f.key]} /></Pair>)}
        </dl>
      )}
    </details>
  )
}

function Submissions({ form }: { form: LoadedForm }) {
  const { orgId, can } = useOrg()
  const manage = can('forms.manage')
  const subs = useQuery({ queryKey: ['submissions', form.id], queryFn: async () => {
    const { data, error } = await supabase.from('form_submissions').select('id, answers, submitted_by, created_at')
      .eq('form_id', form.id).order('created_at', { ascending: false }).limit(LIMIT)
    if (error) throw error
    return data as unknown as Sub[]
  } })
  const emails = useQuery({ queryKey: ['member-emails', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('members').select('user_id, email').eq('org_id', orgId!)
    if (error) throw error
    return new Map(data.filter((m) => m.user_id).map((m) => [m.user_id as string, m.email]))
  } })
  return (
    <section className="flex flex-col gap-4" aria-labelledby="subs-h">
      <div>
        <h1 id="subs-h" className="page-title">{manage ? 'Submissions' : 'Your submissions'}</h1>
        <p className="rnr-muted">{form.name}</p>
      </div>
      {subs.isPending && <Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }]} />}
      {subs.isError && (
        <div className="rnr-card gap-3">
          <p>We could not load the submissions. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => subs.refetch()}>Try again</button></div>
        </div>
      )}
      {subs.data?.length === 0 && (
        <div className="rnr-card gap-3">
          <h2 className="rnr-card-title">No submissions yet</h2>
          <p className="rnr-muted">Answers appear here as soon as someone submits this form.</p>
          <div><a className="rnr-btn rnr-btn-primary" href={`#/forms/${form.id}/fill`}>Fill in this form</a></div>
        </div>
      )}
      {subs.data?.length === LIMIT && <p className="rnr-muted">Showing the newest {LIMIT} submissions.</p>}
      {subs.data?.map((s) => <Row key={s.id} sub={s} fields={form.schema} by={emails.data?.get(s.submitted_by) ?? 'Former member'} />)}
    </section>
  )
}

export function SubmissionsPage({ id }: { id: string }) {
  return <FormGate id={id}>{(form) => <Submissions form={form} />}</FormGate>
}
```

`src/App.tsx` — import `SubmissionsPage` from `./forms/submissions/SubmissionsPage` and add to `Page`:
```tsx
    case 'form-submissions': return <SubmissionsPage id={route.id} />
```

- [ ] **Step 2: Typecheck, lint, unit tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: no errors, no warnings, all tests pass.

- [ ] **Step 3: End-to-end browser check** (spec §11 "one end-to-end flow per phase"; `supabase db reset`, `supabase functions serve`, `pnpm dev`; Browser pane; use `alpha.localhost:5173` and `beta.localhost:5173` when two users are open at once)

1. `admin@alpha.test`: New form "Trip consent" → Short text "Student name" (required), Date "Trip date", Single select "Pickup" (Bus, Parent), File upload "Medical note" with show-if Pickup is Parent, Repeating section "Contacts" (1–2 rows) with Short text "Phone", Calculated "Contacts listed" = `count(contacts)`, Page break before the section, Signature → Save form → "Saved".
2. `member@alpha.test` (other tab): Forms → Trip consent → Fill in → Next page with nothing filled → errors on page 1 only → fill in, Pickup Parent → upload a note → Next page → one Contacts row shown → Contacts listed shows 1 → sign, save signature → Submit form → "Form submitted."
3. Member → View submissions → title "Your submissions", one row; open it → file link opens the PDF; signature image renders; Contacts listed 1.
4. Admin → Trip consent → Submissions → title "Submissions", the member's row with their email.
5. `viewer@alpha.test` → Trip consent → Submissions → "No submissions yet" (cannot see the member's).
6. `owner@beta.test` → paste the Trip consent fill URL → "This form does not exist".
7. Admin → Forms → Delete Trip consent → "This form has submissions, so it cannot be deleted."
8. DevTools on the member tab: replay the `submit-form` request with `"contacts_listed": 99` → the response's `answers.contacts_listed` is 1 (Review Focus #1).

- [ ] **Step 4: Commit**

```bash
git add src/forms/submissions/SubmissionsPage.tsx src/App.tsx
git commit -m "feat: add form submissions page"
```

---

## Self-review notes

- §4.1 storage → Task 3 (`forms`, JSON array schema, `created_by`, `updated_at`). §4.2 all 12 types → Task 1 types, Task 2 validation, Task 7 inputs (file upload to the org-scoped bucket, signature canvas → PNG), Task 8 builder; the fixture and seed form use all 12 and a test asserts it. `page_break` multi-page → `pages()` / `visiblePages()` (Task 2), per-page Next in `FormRunner` (Task 7). `group` with `repeat {min,max}` and array answers → Tasks 2 and 7. `calculated` → Task 1 parser, recomputed in `resolve()` (browser) and `submit-form` (server, client value discarded).
- §4.3 rules → `evaluate()` with all nine operators, `group[].field` any-match and `group.count`, unreadable → false (Task 1). Phase 3 Condition cards, Phase 5 report filters and Phase 6 audiences import the same function.
- §4.4 parser → no `eval`; `+ − × ÷`, parentheses, field refs, `sum/count/min/max/days_between/round/if` (Task 1).
- §4.5 behaviour → dnd-kit list with keyboard and Move up/down paths + live preview (Task 8); Next validates only the current page and fully hidden pages are skipped (Tasks 2, 7); browser validation for UX, `submit-form` authoritative (Task 4).
- §10 → browser never trusted (Global Constraints, Task 4); no silent failures: 0-row writes reported (Tasks 6, 8), upload and submit errors shown (Task 7). §11 → node + deno unit tests on the shared module (Tasks 1–2), pgTAP RLS allow/deny for `forms.manage`, members, other org, storage (Task 3), `deno test` for the Edge Function (Task 4), one browser end-to-end flow (Task 9). §12 phase 2 "12 field types, preview, standalone submit" → Tasks 1–9. §15 → designer spec first (Task 5); tokens and `rnr-*` classes only; the one new CSS rule reads tokens.
- Review Focus 1 → Task 4 test + Task 9 step 8; 2 → Task 2 answers test; 3 → Task 3 pgTAP; 4 → Task 3 pgTAP + Task 4 test; 5 → Task 1 tests under node and deno.
- Out of scope, by the spec: form versioning, public forms. Deferred with a `shortcut:` note: cleanup of uploaded-but-unsubmitted files (Task 7), paging past 200 submissions (Task 9).
