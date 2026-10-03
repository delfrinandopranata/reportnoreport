import { assertEquals } from 'jsr:@std/assert@1'
import { inReminderWindow, groupByFirm, reminderEmailBody, type ExpiringContract } from './rules.ts'

Deno.test('inReminderWindow: today is in window', () => {
  assertEquals(inReminderWindow('2026-10-04', '2026-10-04'), true)
})

Deno.test('inReminderWindow: exactly 7 days out is in window', () => {
  assertEquals(inReminderWindow('2026-10-11', '2026-10-04'), true)
})

Deno.test('inReminderWindow: 8 days out is not in window', () => {
  assertEquals(inReminderWindow('2026-10-12', '2026-10-04'), false)
})

Deno.test('inReminderWindow: already past is not in window', () => {
  assertEquals(inReminderWindow('2026-10-03', '2026-10-04'), false)
})

Deno.test('groupByFirm: splits contracts by firm_id, preserving order', () => {
  const a: ExpiringContract = { id: '1', firm_id: 'f1', title: 'A', end_date: '2026-10-05', client_name: 'Alpha' }
  const b: ExpiringContract = { id: '2', firm_id: 'f2', title: 'B', end_date: '2026-10-06', client_name: 'Beta' }
  const c: ExpiringContract = { id: '3', firm_id: 'f1', title: 'C', end_date: '2026-10-07', client_name: 'Gamma' }
  const grouped = groupByFirm([a, b, c])
  assertEquals(grouped.get('f1'), [a, c])
  assertEquals(grouped.get('f2'), [b])
})

Deno.test('reminderEmailBody: singular contract', () => {
  const body = reminderEmailBody([{ id: '1', firm_id: 'f1', title: 'Retainer', end_date: '2026-10-10', client_name: 'Kopi Corner' }])
  assertEquals(body.startsWith('A contract is approaching'), true)
  assertEquals(body.includes('- Retainer (Kopi Corner) — ends 2026-10-10'), true)
})

Deno.test('reminderEmailBody: multiple contracts', () => {
  const body = reminderEmailBody([
    { id: '1', firm_id: 'f1', title: 'Retainer', end_date: '2026-10-10', client_name: 'Kopi Corner' },
    { id: '2', firm_id: 'f1', title: 'Service', end_date: '2026-10-11', client_name: 'Harbourline' },
  ])
  assertEquals(body.startsWith('Contracts are approaching'), true)
  assertEquals(body.split('\n').filter((l) => l.startsWith('-')).length, 2)
})
