import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, isVariable, readAppUrl, render, valueText, variablesIn, type RenderContext } from './render.ts'

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  record: { title: 'Leave: Ada', data: { days: 3, cover: ['Peer', 'Team lead'], claims: [{ item: 'Taxi' }], agree: true, note: '' } },
  step: { assignee: { name: 'Admin' } },
  link: { task: 'http://localhost:5173/app/#/tasks/t1', record: 'http://localhost:5173/app/#/records/r1', invite: '' },
  org: { name: 'Alpha School' },
  recipient: { name: 'Ada' },
  ...over,
})

test('fills every variable', () => {
  const r = render({ subject: 'Task: {{record.title}}', body: '{{recipient.name}} / {{step.assignee.name}} / {{org.name}} / {{ record.data.days }} / {{link.record}}' }, ctx())
  assert.equal(r.subject, 'Task: Leave: Ada')
  assert.equal(r.text, 'Ada / Admin / Alpha School / 3 / http://localhost:5173/app/#/records/r1')
  assert.deepEqual(r.unknown, [])
})
test('values are HTML-escaped in html and kept as typed in text', () => {
  const evil = '<script>alert("x")</script> & \'quotes\' <a href="https://evil.example">win</a>'
  const r = render({ subject: 'S', body: 'Hi {{recipient.name}}, {{record.title}}, {{org.name}}, {{record.data.note}}' },
    ctx({ recipient: { name: evil }, record: { title: evil, data: { note: evil } }, org: { name: evil } }))
  assert.equal(r.html.includes('<script>'), false)
  assert.equal(r.html.includes('<a href="https://evil.example">'), false)
  assert.equal(r.html.split('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;').length - 1, 4)
  assert.equal(r.text, `Hi ${evil}, ${evil}, ${evil}, ${evil}`)
})
test('the template text itself is escaped too; paragraphs and line breaks become markup', () => {
  const r = render({ subject: 'S', body: '<b>Bold</b> & co\nline two\n\nNew paragraph' }, ctx())
  assert.equal(r.html, '<p>&lt;b&gt;Bold&lt;/b&gt; &amp; co<br>line two</p>\n<p>New paragraph</p>')
})
test('substitution is single-pass: a value is never expanded again', () => {
  const r = render({ subject: '{{recipient.name}}', body: '{{recipient.name}}' }, ctx({ recipient: { name: '{{org.name}}' } }))
  assert.equal(r.subject, '{{org.name}}')
  assert.equal(r.text, '{{org.name}}')
})
test('the subject is one line, at most 200 characters', () => {
  const r = render({ subject: 'Hi {{recipient.name}}', body: 'x' }, ctx({ recipient: { name: 'Ada\r\nBcc: victim@example.com' } }))
  assert.equal(r.subject, 'Hi Ada Bcc: victim@example.com')
  assert.equal(render({ subject: '{{record.title}}', body: 'x' }, ctx({ record: { title: 'x'.repeat(500), data: {} } })).subject.length, 200)
})
test('links become anchors in html only when they are http(s)', () => {
  const r = render({ subject: 'S', body: 'Open {{link.task}}' }, ctx())
  assert.equal(r.html, '<p>Open <a href="http://localhost:5173/app/#/tasks/t1">http://localhost:5173/app/#/tasks/t1</a></p>')
  const bad = render({ subject: 'S', body: '{{link.task}}' }, ctx({ link: { task: 'javascript:alert(1)', record: '', invite: '' } }))
  assert.equal(bad.html, '<p>javascript:alert(1)</p>')
  assert.equal(render({ subject: 'S', body: '[{{link.invite}}]' }, ctx()).html, '<p>[]</p>')
})
test('unknown variables render empty and are reported; missing answers render empty', () => {
  const r = render({ subject: '{{nope}}x', body: '{{record.data.missing}}|{{record.data.Bad-Key}}|{{recipient.email}}' }, ctx())
  assert.equal(r.subject, 'x')
  assert.equal(r.text, '||')
  assert.deepEqual(r.unknown, ['nope', 'record.data.Bad-Key', 'recipient.email'])
  assert.equal(render({ subject: 'S', body: '{{record.data.__proto__}}' }, ctx()).text, '')
})
test('answers read as one line of text', () => {
  assert.equal(valueText(['Peer', 'Team lead']), 'Peer, Team lead')
  assert.equal(valueText([{ item: 'Taxi' }]), '1 row')
  assert.equal(valueText([{ a: 1 }, { a: 2 }]), '2 rows')
  assert.equal(valueText(true), 'Yes')
  assert.equal(valueText(false), 'No')
  assert.equal(valueText(Number.NaN), '')
  assert.equal(valueText({ a: 1 }), '')
  assert.equal(valueText(null), '')
})
test('helpers', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;')
  assert.deepEqual(variablesIn('a {{org.name}} b {{ record.data.days }}'), ['org.name', 'record.data.days'])
  assert.equal(isVariable('record.data.days'), true)
  assert.equal(isVariable('record.data.Days'), false)
  assert.equal(isVariable('org.id'), false)
})
test('APP_URL must be an absolute http(s) URL ending in /app/', () => {
  assert.equal(readAppUrl('http://localhost:5173/app/'), 'http://localhost:5173/app/')
  assert.equal(readAppUrl('https://reportnoreport.com/app/'), 'https://reportnoreport.com/app/')
  for (const bad of [undefined, '', 'reportnoreport.com/app/', 'https://reportnoreport.com/', 'https://reportnoreport.com/app', 'ftp://x/app/', 'https://x/app/?a=1', 'javascript:alert(1)//app/']) {
    assert.throws(() => readAppUrl(bad), /APP_URL/)
  }
})
