import { assertEquals } from 'jsr:@std/assert'
import { getEventAction } from './rules.ts'

Deno.test('getEventAction: paid session → payment', () => {
  const event = {
    type: 'checkout.session.completed',
    data: {
      object: {
        payment_status: 'paid',
        client_reference_id: 'firm-123',
        payment_intent: 'pi_test',
      },
    },
  }

  const action = getEventAction(event)
  assertEquals(action.type, 'payment')
  if (action.type === 'payment') {
    assertEquals(action.firmId, 'firm-123')
    assertEquals(action.paymentIntentId, 'pi_test')
  }
})

Deno.test('getEventAction: paid session with metadata.firm_id → payment', () => {
  const event = {
    type: 'checkout.session.completed',
    data: {
      object: {
        payment_status: 'paid',
        metadata: { firm_id: 'firm-456' },
        payment_intent: 'pi_test2',
      },
    },
  }

  const action = getEventAction(event)
  assertEquals(action.type, 'payment')
  if (action.type === 'payment') {
    assertEquals(action.firmId, 'firm-456')
    assertEquals(action.paymentIntentId, 'pi_test2')
  }
})

Deno.test('getEventAction: unpaid session → ignore', () => {
  const event = {
    type: 'checkout.session.completed',
    data: {
      object: {
        payment_status: 'unpaid',
        client_reference_id: 'firm-123',
        payment_intent: 'pi_test',
      },
    },
  }

  const action = getEventAction(event)
  assertEquals(action.type, 'ignore')
})

Deno.test('getEventAction: charge.refunded → refund', () => {
  const event = {
    type: 'charge.refunded',
    data: {
      object: {
        payment_intent: 'pi_test',
      },
    },
  }

  const action = getEventAction(event)
  assertEquals(action.type, 'refund')
  if (action.type === 'refund') {
    assertEquals(action.paymentIntentId, 'pi_test')
  }
})

Deno.test('getEventAction: unknown event → ignore', () => {
  const event = {
    type: 'payment_intent.succeeded',
    data: {
      object: {},
    },
  }

  const action = getEventAction(event)
  assertEquals(action.type, 'ignore')
})

Deno.test('getEventAction: checkout without payment_intent → ignore', () => {
  const event = {
    type: 'checkout.session.completed',
    data: {
      object: {
        payment_status: 'paid',
        client_reference_id: 'firm-123',
        // no payment_intent
      },
    },
  }

  const action = getEventAction(event)
  assertEquals(action.type, 'ignore')
})

Deno.test('getEventAction: refund without payment_intent → ignore', () => {
  const event = {
    type: 'charge.refunded',
    data: {
      object: {
        // no payment_intent
      },
    },
  }

  const action = getEventAction(event)
  assertEquals(action.type, 'ignore')
})
