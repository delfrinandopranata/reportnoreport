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
