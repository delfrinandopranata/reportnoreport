import { resolve, type Answers, type Field } from '../logic.ts'

/** Same en-GB day format as the forms list; ISO appears only inside inputs. */
export const formatDay = (iso: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : null
  return d && !Number.isNaN(+d) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : iso
}

/** Fields the shared evaluator hid at submit time, judged as of the submission. */
export const hiddenKeys = (fields: Field[], answers: Answers, createdAt: string) =>
  resolve(fields, answers, new Date(createdAt)).hidden
