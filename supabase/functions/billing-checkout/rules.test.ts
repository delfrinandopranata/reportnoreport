import { assertEquals } from 'jsr:@std/assert@1'
import { isOwner, validateNotAlreadyPaid, buildCheckoutBody, type ProfileRow, type FirmRow } from './rules.ts'

Deno.test('isOwner: owner returns true', () => {
  const profile: ProfileRow = { role: 'owner', is_super_admin: false, status: 'active', firm_id: 'f1' }
  assertEquals(isOwner(profile), true)
})

Deno.test('isOwner: admin returns false', () => {
  const profile: ProfileRow = { role: 'admin', is_super_admin: false, status: 'active', firm_id: 'f1' }
  assertEquals(isOwner(profile), false)
})

Deno.test('isOwner: super-admin returns false', () => {
  const profile: ProfileRow = { role: 'owner', is_super_admin: true, status: 'active', firm_id: 'f1' }
  assertEquals(isOwner(profile), false)
})

Deno.test('isOwner: inactive status returns false', () => {
  const profile: ProfileRow = { role: 'owner', is_super_admin: false, status: 'suspended', firm_id: 'f1' }
  assertEquals(isOwner(profile), false)
})

Deno.test('isOwner: null returns false', () => {
  assertEquals(isOwner(null), false)
})

Deno.test('validateNotAlreadyPaid: trial firm returns null', () => {
  const firm: FirmRow = { id: 'f1', billing_status: 'trial', stripe_customer_id: null, status: 'active' }
  assertEquals(validateNotAlreadyPaid(firm), null)
})

Deno.test('validateNotAlreadyPaid: read_only firm returns null', () => {
  const firm: FirmRow = { id: 'f1', billing_status: 'read_only', stripe_customer_id: null, status: 'active' }
  assertEquals(validateNotAlreadyPaid(firm), null)
})

Deno.test('validateNotAlreadyPaid: paid firm returns error', () => {
  const firm: FirmRow = { id: 'f1', billing_status: 'paid', stripe_customer_id: null, status: 'active' }
  const err = validateNotAlreadyPaid(firm)
  assertEquals(err, 'This firm is already paid.')
})

Deno.test('validateNotAlreadyPaid: complimentary firm returns error', () => {
  const firm: FirmRow = { id: 'f1', billing_status: 'complimentary', stripe_customer_id: null, status: 'active' }
  const err = validateNotAlreadyPaid(firm)
  assertEquals(err, 'This firm is already paid.')
})

Deno.test('validateNotAlreadyPaid: suspended firm returns error', () => {
  const firm: FirmRow = { id: 'f1', billing_status: 'trial', stripe_customer_id: null, status: 'suspended' }
  const err = validateNotAlreadyPaid(firm)
  assertEquals(err, 'This firm cannot make payments right now.')
})

Deno.test('validateNotAlreadyPaid: null firm returns error', () => {
  const err = validateNotAlreadyPaid(null)
  assertEquals(err, 'Firm not found.')
})

Deno.test('buildCheckoutBody: constructs form-encoded body with correct keys', () => {
  const body = buildCheckoutBody('f1', 'cust_123')
  const lines = body.split('&').sort()
  assertEquals(lines.includes('line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=myr'), true)
  assertEquals(lines.includes('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=1000'), true)
  assertEquals(lines.includes('line_items%5B0%5D%5Bprice_data%5D%5Bproduct_data%5D%5Bname%5D=ReportNoReport%20%E2%80%94%20one-time%20licence'), true)
  assertEquals(lines.includes('line_items%5B0%5D%5Bquantity%5D=1'), true)
  assertEquals(lines.includes('mode=payment'), true)
  assertEquals(lines.includes('customer=cust_123'), true)
  assertEquals(lines.includes('client_reference_id=f1'), true)
  assertEquals(lines.includes('metadata%5Bfirm_id%5D=f1'), true)
})

Deno.test('buildCheckoutBody: includes success_url and cancel_url when provided', () => {
  const body = buildCheckoutBody('f1', 'cust_123', 'http://localhost:5201/app/#settings/billing?paid=1', 'http://localhost:5201/app/#settings/billing')
  assertEquals(body.includes('success_url=http%3A%2F%2Flocalhost%3A5201%2Fapp%2F%23settings%2Fbilling%3Fpaid%3D1'), true)
  assertEquals(body.includes('cancel_url=http%3A%2F%2Flocalhost%3A5201%2Fapp%2F%23settings%2Fbilling'), true)
})
