import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../data/supabase'
import type { Json } from '../../data/database.types'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { FolderCard } from '../../ui/FolderCard'
import { friendlyError } from '../../ui/errors'
import { CheckIcon, PencilIcon } from '../../ui/icons'
import { setNavGuard, type Next } from '../../ui/navGuard'
import { useAction } from '../../ui/useAction'
import { useFocusAfterRender } from '../../ui/useFocusAfterRender'
import { useNotice } from '../../ui/useNotice'
import { validateSchema, type Field, type FieldType } from '../logic'
import type { LoadedForm } from '../api'
import { FormGate } from '../FormGate'
import { FormRunner } from '../fill/FormRunner'
import { FieldList } from './FieldList'
import { FieldSettings } from './FieldSettings'
import { Palette, SectionPalette } from './Palette'
import { TYPE_LABELS, move, newField, typeLabel } from './builderOps'
import { Note } from '../../ui/Note.tsx'
import { PageHead } from '../../ui/PageHead'

type Sel = { key: string; child?: string } | null
const nameOf = (f: Field) => f.label || typeLabel(f.type)

function Builder({ form, onReload }: { form: LoadedForm; onReload(): Promise<void> }) {
  const qc = useQueryClient()
  const [name, setName] = useState(form.name)
  const [fields, setFields] = useState<Field[]>(form.schema)
  const [saved, setSaved] = useState({ name: form.name, fields: form.schema, version: form.updated_at })
  const [sel, setSel] = useState<Sel>(null)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [note, setNote] = useState('')
  const [leaveTo, setLeaveTo] = useState<Next | null>(null)
  const [notice, setNotice] = useNotice()
  const save = useAction()
  const reload = useAction()
  const focusLater = useFocusAfterRender()
  const issues = useMemo(() => validateSchema(fields), [fields])
  const issueRoots = useMemo(() => new Set(issues.map((i) => i.key.split('.')[0])), [issues])
  const dirty = name !== saved.name || fields !== saved.fields

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    setNavGuard((next) => { if (next === `#/forms/${form.id}/edit`) return false; setLeaveTo(() => next); return true })
    return () => { removeEventListener('beforeunload', warn); setNavGuard(null) }
  }, [dirty, form.id])

  const top = sel ? fields.find((f) => f.key === sel.key) : undefined
  const child = top && sel?.child ? top.fields?.find((c) => c.key === sel.child) : undefined
  const replace = (key: string, next: Field) => setFields(fields.map((f) => (f.key === key ? next : f)))
  /** Wide screens focus the new field's Label input; phones scroll to and focus its settings heading. */
  const focusSettings = (base: string) => focusLater(() => {
    const wide = matchMedia('(min-width: 1024px)').matches
    const el = document.getElementById(wide ? `${base}-label` : `${base}-h`)
    if (!wide) requestAnimationFrame(() => el?.scrollIntoView({ block: 'start' }))
    return el
  })
  const select = (s: Sel) => { setSel(s); if (!matchMedia('(min-width: 1024px)').matches && s) focusSettings(s.child ? 'fs-child' : 'fs-top') }

  const add = (type: FieldType) => {
    const f = newField(type, fields.map((x) => x.key))
    setFields([...fields, f]); setSel({ key: f.key })
    setNote(`${TYPE_LABELS[type]} added at position ${fields.length + 1} of ${fields.length + 1}.`)
    focusSettings('fs-top')
  }
  const addChild = (type: FieldType) => {
    if (!top) return
    const kids = top.fields ?? []
    const f = newField(type, kids.map((c) => c.key))
    replace(top.key, { ...top, fields: [...kids, f] }); setSel({ key: top.key, child: f.key })
    setNote(`${TYPE_LABELS[type]} added at position ${kids.length + 1} of ${kids.length + 1}.`)
    focusSettings('fs-child')
  }
  const remove = () => {
    if (!top) return
    setFields(fields.filter((f) => f.key !== top.key)); setSel(null)
    setNote(`${nameOf(top)} removed. ${fields.length - 1} fields left.`)
    focusLater('fields-h')
  }
  const removeChild = () => {
    if (!top || !child) return
    const kids = (top.fields ?? []).filter((x) => x.key !== child.key)
    replace(top.key, { ...top, fields: kids }); setSel({ key: top.key })
    setNote(`${nameOf(child)} removed. ${kids.length} fields left.`)
    focusLater('section-h')
  }

  const onSave = () => save.run(async () => {
    setError(null); setNameError(null); setConflict(false)
    if (!name.trim()) { setNameError('Enter a name for this form.'); document.getElementById('form-name')?.focus(); return false }
    if (issues.length) {
      setError(`Fix ${issues.length} ${issues.length === 1 ? 'problem' : 'problems'} before saving. Fields that need fixing are marked in the list.`)
      const [root, kid] = issues[0].key.split('.')
      if (root) {
        setSel(kid ? { key: root, child: kid } : { key: root })
        focusLater(() => document.querySelector<HTMLElement>(`[data-key="${root}"] .rnr-pick`))
      }
      return false
    }
    const { data, error } = await supabase.from('forms').update({ name: name.trim(), schema: fields as unknown as NonNullable<Json> })
      .eq('id', form.id).eq('updated_at', saved.version).select('updated_at')
    if (error) { setError(friendlyError(error)); return false }
    if (!data.length) { setConflict(true); return false } // 0 rows: someone else saved first, or access was lost
    const version = data[0].updated_at
    setSaved({ name: name.trim(), fields, version }); setName(name.trim()); setNotice('Form saved.')
    qc.setQueryData(['form', form.id], { ...form, name: name.trim(), schema: fields, updated_at: version })
    await qc.invalidateQueries({ queryKey: ['forms', form.org_id] })
    return true
  }, true)

  const kids = top?.fields ?? []
  return (
    <section aria-labelledby="builder-h" className="flex flex-col gap-4">
      <PageHead id="builder-h" crumb="Build · Forms" title="Edit form" />
      <div className="rnr-card flex-row flex-wrap items-end gap-3">
        <div className="rnr-field flex-1 min-w-[240px]" data-invalid={nameError ? true : undefined}>
          <label htmlFor="form-name" className="rnr-label">Form name<span aria-hidden="true"> *</span></label>
          <input id="form-name" className="rnr-input" maxLength={120} value={name} aria-required="true" aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'form-name-err' : undefined} onChange={(e) => { setName(e.target.value); setNameError(null) }} />
          {nameError && <p id="form-name-err" className="rnr-error">{nameError}</p>}
        </div>
        {dirty && !save.busy && <span className="rnr-chip" data-tone="warn"><PencilIcon size={14} />Unsaved changes</span>}
        <a className="rnr-btn rnr-btn-ghost" href={`#/forms/${form.id}/fill`}>Open form</a>
        <button type="button" className="rnr-btn rnr-btn-primary" aria-busy={save.busy} onClick={onSave}>
          {save.busy ? <><span className="rnr-spin" aria-hidden="true" />Saving…</> : save.saved ? <><span className="rnr-pop"><CheckIcon /></span>Saved</> : 'Save form'}
        </button>
      </div>
      <p className="rnr-status" role="status">{notice && <><CheckIcon size={14} />{notice}</>}</p>
      <p className="sr-only" role="status">{note}</p>
      {error && <Note>{error}</Note>}
      {conflict && (
        <div className="rnr-note" data-tone="warn" role="alert">
          <div className="grid gap-3">
            <p>This form was changed by someone else, or you can no longer edit it. Reload to see the latest version. Your unsaved changes will be lost.</p>
            <div>
              <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={reload.busy} onClick={() => reload.run(onReload)}>
                {reload.busy && <span className="rnr-spin" aria-hidden="true" />}Reload form
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 min-w-0">
          <Palette onAdd={add} />
          <div className="rnr-canvas">
            <h2 id="fields-h" tabIndex={-1} className="sr-only">Fields</h2>
            {fields.length
              ? <FieldList label="Fields" fields={fields} selected={sel?.key ?? null} issues={issueRoots} onNote={setNote}
                  onSelect={(key) => select({ key })} onMove={(a, b) => setFields(move(fields, a, b))} />
              : <div className="rnr-drop">No fields yet. Choose a field type to add your first one.</div>}
          </div>
          {top && (
            <FieldSettings idBase="fs-top" field={top} scope={fields} taken={fields.map((f) => f.key).filter((k) => k !== top.key)}
              issues={issues.filter((i) => i.key === top.key)}
              onChange={(f) => { replace(top.key, f); setSel({ key: f.key, child: sel?.child }) }} onRemove={remove} />
          )}
          {top?.type === 'group' && (
            <div className="rnr-card gap-3">
              <div className="rnr-card-head"><h2 id="section-h" tabIndex={-1} className="rnr-card-title">Fields in {top.label}</h2></div>
              <FieldList label={`Fields in ${top.label}`} fields={kids} selected={sel?.child ?? null} onNote={setNote}
                issues={new Set(issues.filter((i) => i.key.startsWith(`${top.key}.`)).map((i) => i.key.split('.')[1]))}
                onSelect={(c) => select({ key: top.key, child: c })} onMove={(a, b) => replace(top.key, { ...top, fields: move(kids, a, b) })} />
              <SectionPalette onAdd={addChild} />
            </div>
          )}
          {top && child && (
            <FieldSettings idBase="fs-child" field={child} scope={[...fields, ...kids]} taken={kids.map((c) => c.key).filter((k) => k !== child.key)}
              issues={issues.filter((i) => i.key === `${top.key}.${child.key}`)}
              onChange={(c) => { replace(top.key, { ...top, fields: kids.map((x) => (x.key === child.key ? c : x)) }); setSel({ key: top.key, child: c.key }) }}
              onRemove={removeChild} />
          )}
        </div>
        <aside aria-labelledby="preview-h" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <FolderCard tab={<h2 id="preview-h">Preview</h2>}>
            <div className="grid gap-3">
              <p className="rnr-caption">Changes appear here as you edit. Nothing you enter is saved.</p>
              <FormRunner fields={fields} idPrefix="preview" />
            </div>
          </FolderCard>
        </aside>
      </div>
      <ConfirmDialog open={!!leaveTo} title="Leave without saving?" body={`Your changes to ${name.trim() || 'this form'} will be lost.`}
        confirmLabel="Leave without saving" busyLabel="Leaving…" busy={false} error={null}
        onConfirm={() => { const to = leaveTo; setNavGuard(null); setLeaveTo(null); if (typeof to === 'function') to(); else if (to) location.hash = to }}
        onClose={() => setLeaveTo(null)} />
    </section>
  )
}

export function FormBuilder({ id }: { id: string }) {
  const qc = useQueryClient()
  const [round, setRound] = useState(0)
  const reload = async () => { await qc.refetchQueries({ queryKey: ['form', id] }); setRound((r) => r + 1) }
  return <FormGate id={id}>{(form) => <Builder key={round} form={form} onReload={reload} />}</FormGate>
}
