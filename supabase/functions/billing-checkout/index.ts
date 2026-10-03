import { createClient } from 'npm:@supabase/supabase-js@2'
import { isOwner, validateNotAlreadyPaid, buildCheckoutBody, type ProfileRow, type FirmRow } from './rules.ts'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const appUrl = Deno.env.get('APP_URL')

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  const admin = createClient(url, serviceKey)
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  const { data: auth } = await admin.auth.getUser(jwt ?? '')
  if (!auth.user) return json(401, { error: 'Please sign in again.' })

  const { data: profile } = await admin.from('profiles').select('*').eq('user_id', auth.user.id).single<ProfileRow>()
  if (!isOwner(profile)) return json(403, { error: 'Only the firm owner can make payments.' })

  const { data: firm } = await admin.from('firms').select('*').eq('id', profile.firm_id).single<FirmRow>()
  const validationErr = validateNotAlreadyPaid(firm)
  if (validationErr) return json(400, { error: validationErr })

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) return json(503, { error: 'Payments are not set up yet.' })

  try {
    let customerId = firm.stripe_customer_id
    if (!customerId) {
      const createCustomerResp = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `email=${encodeURIComponent(auth.user.email)}&metadata[firm_id]=${encodeURIComponent(firm.id)}`,
      })
      if (!createCustomerResp.ok) {
        const errData = await createCustomerResp.text()
        console.error('Stripe customer creation error:', errData)
        return json(500, { error: 'Payment setup failed. Try again or contact support.' })
      }
      const customerData = await createCustomerResp.json() as { id: string }
      customerId = customerData.id
      await admin.from('firms').update({ stripe_customer_id: customerId }).eq('id', firm.id)
    }

    const successUrl = appUrl ? `${appUrl}/app/#settings/billing?paid=1` : 'http://localhost:5201/app/#settings/billing?paid=1'
    const cancelUrl = appUrl ? `${appUrl}/app/#settings/billing` : 'http://localhost:5201/app/#settings/billing'
    const checkoutBody = buildCheckoutBody(firm.id, customerId, successUrl, cancelUrl)

    const sessionResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: checkoutBody,
    })
    if (!sessionResp.ok) {
      const errData = await sessionResp.text()
      console.error('Stripe session creation error:', errData)
      return json(500, { error: 'Payment setup failed. Try again or contact support.' })
    }
    const sessionData = await sessionResp.json() as { id: string; url: string }
    await admin.from('firms').update({ stripe_checkout_session_id: sessionData.id }).eq('id', firm.id)
    return json(200, { url: sessionData.url })
  } catch (err) {
    console.error('Checkout error:', err)
    return json(500, { error: 'Payment setup failed. Try again or contact support.' })
  }
})
