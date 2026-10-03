import type { BankAccount } from '../data/mappers'

export type BankFormValues = { name: string; bankName: string; accountName: string; accountNo: string; isDefaultChecked: boolean }

/** An edit preserves default/active state; a new account is default when ticked or the firm's first. */
export function bankPayload(editing: Partial<BankAccount> | null, f: BankFormValues, existingCount: number) {
  const { isDefaultChecked, ...fields } = f
  return {
    id: editing?.id,
    ...fields,
    isDefault: !!editing?.isDefault || isDefaultChecked || (!editing && existingCount === 0),
    isActive: editing?.isActive ?? true,
  }
}
