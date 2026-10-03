import { makeMoney } from '../ledger'
import { useSession } from './session'

export function useMoney() {
  const { firm } = useSession()
  return { ...makeMoney(firm.currency), currency: firm.currency }
}
