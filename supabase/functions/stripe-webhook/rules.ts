export type StripeEventAction = 'payment' | 'refund' | 'ignore'

export interface PaymentAction {
  type: 'payment'
  firmId: string
  paymentIntentId: string
}

export interface RefundAction {
  type: 'refund'
  firmId: string
  paymentIntentId: string
}

export type EventAction = PaymentAction | RefundAction | { type: 'ignore' }

export function getEventAction(event: any): EventAction {
  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object
    if (session?.payment_status === 'paid') {
      const firmId = session.client_reference_id || session.metadata?.firm_id
      if (firmId && session.payment_intent) {
        return {
          type: 'payment',
          firmId,
          paymentIntentId: session.payment_intent,
        }
      }
    }
    return { type: 'ignore' }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data?.object
    if (charge?.payment_intent) {
      return {
        type: 'refund',
        firmId: '', // Will be looked up by payment intent
        paymentIntentId: charge.payment_intent,
      }
    }
    return { type: 'ignore' }
  }

  return { type: 'ignore' }
}
