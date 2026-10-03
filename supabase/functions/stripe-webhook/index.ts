import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { verify, SIGNATURE_HEADER } from './verify.ts'
import { getEventAction, type EventAction } from './rules.ts'

const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

if (!url || !serviceKey) {
  throw new Error('Missing environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
}

async function releaseEventOnFailure(
  admin: SupabaseClient,
  eventId: string
): Promise<void> {
  const { error } = await admin.from('stripe_events').delete().eq('event_id', eventId)
  if (error) {
    console.error(`Failed to release event ${eventId} on RPC failure:`, error.code)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check webhook secret is configured
  if (!webhookSecret) {
    return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const signatureHeader = req.headers.get(SIGNATURE_HEADER) ?? ''
  const bodyText = await req.text()

  // Verify Stripe signature FIRST
  const isValid = await verify(signatureHeader, bodyText, webhookSecret)
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let event: any
  try {
    event = JSON.parse(bodyText)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(url, serviceKey)

  // Record the event for idempotency (unique constraint guards against duplicates)
  const { error: insertError } = await admin.from('stripe_events').insert({
    event_id: event.id,
    type: event.type,
    received_at: new Date().toISOString(),
  })

  if (insertError) {
    // Duplicate event_id (unique constraint) = another request already processed it
    if (insertError.code === '23505') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.error('Failed to record event:', insertError.code)
    return new Response(JSON.stringify({ error: 'Failed to record event' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Process the event
  const action = getEventAction(event)

  if (action.type === 'payment') {
    const { error } = await admin.rpc('record_payment', {
      p_firm_id: action.firmId,
      p_payment_intent_id: action.paymentIntentId,
    })

    if (error) {
      console.error('Failed to record payment:', error.code)
      await releaseEventOnFailure(admin, event.id)
      return new Response(JSON.stringify({ error: 'Failed to record payment' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } else if (action.type === 'refund') {
    // Look up firm by stripe_payment_intent_id
    const { data: firms, error: lookupError } = await admin
      .from('firms')
      .select('id')
      .eq('stripe_payment_intent_id', action.paymentIntentId)
      .limit(1)

    if (lookupError) {
      console.error('Failed to look up firm for refund:', lookupError.code)
      await releaseEventOnFailure(admin, event.id)
      return new Response(JSON.stringify({ error: 'Failed to process refund' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (firms && firms.length > 0) {
      const firm = firms[0]
      const { error } = await admin.rpc('record_refund', {
        p_firm_id: firm.id,
      })

      if (error) {
        console.error('Failed to record refund:', error.code)
        await releaseEventOnFailure(admin, event.id)
        return new Response(JSON.stringify({ error: 'Failed to record refund' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    // If firm not found, silently succeed (Stripe may be refunding a charge we don't know about)
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
