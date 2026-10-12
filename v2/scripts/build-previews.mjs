// Builds design/preview.html (every component, every state) and design/components/<Name>/preview.html from
// design/components/<Name>/states.html fragments. Run `node scripts/build-previews.mjs` after editing a fragment.
// `{{i:name}}` expands to a Phosphor icon from design/icons/sprite.svg.
import { readFileSync, writeFileSync } from 'node:fs'

const design = new URL('../design/', import.meta.url)
const sprite = readFileSync(new URL('icons/sprite.svg', design), 'utf8')
export const COMPONENTS = [
  ['Button', 'Button', 'Primary, secondary, ghost, danger, icon; busy and disabled'],
  ['Field', 'Input, textarea, select, combobox and field', 'Label, hint, error, every state'],
  ['Choice', 'Checkbox, radio and switch', 'Native inputs, drawn with tokens'],
  ['Segmented', 'Segmented control', 'One of a few; track 14, item 10'],
  ['Tabs', 'Tabs', 'Underline tabs with a strike-coloured bar'],
  ['Paper', 'Paper and card', 'Raised paper with perforation; flat card; the corner scale'],
  ['FolderCard', 'Folder card', 'A titled section; the tab fits its label'],
  ['KpiTile', 'KPI tile', 'Folder tab label, mono figure, trend'],
  ['Stamp', 'Stamp', 'Approved and Rejected; decoration only'],
  ['Badge', 'Badge, status, chip and trend', 'Marks beside a word, never colour alone'],
  ['Avatar', 'Avatar', 'The only circle'],
  ['DataTable', 'Table', 'Sort, sticky header, density, pager, empty'],
  ['Menu', 'Menu, popover and tooltip', 'Radius 14, items 10'],
  ['Dialog', 'Dialog, sheet and drawer', 'Native dialog; panel radius 20'],
  ['Toast', 'Toast and notice', 'Transient and inline messages'],
  ['Steps', 'Steps', 'Named form steps'],
  ['Progress', 'Progress and spinner', 'Native progress element'],
  ['Skeleton', 'Skeleton', 'Paint the shape at once'],
  ['EmptyState', 'Empty state', 'First run, no results, filtered out, error'],
  ['Shell', 'Sidebar shell', 'Sidebar in a folder, nav rows, groups, phone bar'],
  ['TopBar', 'Top bar and jump bar', 'The ⌘K dock and dialog'],
  ['BellPanel', 'Bell panel', 'Notifications menu'],
  ['PageHeader', 'Page header and back link', 'Micro crumb, display title, actions'],
  ['Widget', 'Widget and dashboard grid', 'States for the dashboard card'],
  ['Charts', 'Charts', 'Bar, line, number; accessible table alternative'],
  ['Canvas', 'Workflow canvas', 'Node card, handle, edge'],
  ['FormBuilder', 'Form builder blocks', 'Palette, blocks, drop slot, sign pad'],
  ['AppearancePanel', 'Appearance panel', 'Theme, density and 8 accents'],
  ['Wordmark', 'Wordmark', 'Newsreader with the strike'],
  ['Landing', 'Landing primitives', 'Wash, window, reveal, pulse'],
  ['Icon', 'Icons', 'Phosphor regular, 20 nav / 16 inline'],
  ['LedgerTable', 'Ledger table', 'v1: running balance, in / out marks, resizable columns'],
  ['MoneyInput', 'Money input', 'v1: ISO code inside the field, mono, right-aligned'],
  ['StatementPaper', 'Statement paper (A4)', 'v1: ink on white in every theme, print rules'],
  ['Banner', 'Banner', 'v1: full-width note for trial, support view, sample data'],
  ['AdminTable', 'Admin table', 'v1: compact firms / waitlist rows with an action menu'],
  ['Coachmark', 'Coachmark', 'v1: tour popover, positioned by custom properties'],
  ['Checklist', 'Checklist', 'v1: onboarding steps with done / next / skipped'],
  ['DropZone', 'Drop zone', 'v1: file add with drag-over, busy and error states'],
]

const WM = (draw) => `<span class="rnr-wordmark"${draw ? ' data-draw' : ''} role="img" aria-label="ReportNoReport">Report<span>No</span><span class="rnr-wordmark-rr">R<svg class="rnr-strike" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20C8 14 14 8 22 3"/></svg></span>eport</span>`
const expand = (html) => html.replace(/\{\{wm(:draw)?\}\}/g, (_, d) => WM(!!d)).replace(/\{\{i:([a-z0-9-]+)\}\}/g, '<svg class="ic" aria-hidden="true"><use href="#i-$1"/></svg>')
const ACCENTS = [['midnight', 'Midnight ink'], ['ocean', 'Ocean glow'], ['bw', 'Black & White'], ['graphite', 'Graphite'], ['fern', 'Fern'], ['rosewood', 'Rosewood'], ['iris', 'Iris'], ['saffron', 'Saffron']]
const seg = (key, items) => `<div class="rnr-seg" role="radiogroup" aria-label="${key}" data-pv="${key}">${items.map(([v, l]) => `<button type="button" role="radio" aria-checked="false" data-v="${v}">${l}</button>`).join('')}</div>`

const bar = (base, nav) => `<div class="pv-bar" role="toolbar" aria-label="Preview modes">
  <b>RNR design</b>
  <label>Theme ${seg('theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']])}</label>
  <label>Accent <select data-pv="accent" aria-label="Accent">${ACCENTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
  <label>Density ${seg('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']])}</label>
  <label>Motion ${seg('motion', [['full', 'Full'], ['flat', 'Flat']])}</label>
  ${nav}</div>`

const defs = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <filter id="rnr-rough"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter>
  <pattern id="rnr-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="2"/></pattern></defs></svg>`

const page = ({ title, base, body, nav }) => `<!doctype html>
<html lang="en-GB" data-theme="light" data-accent="midnight">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<script>(()=>{try{const q=new URLSearchParams(location.search),h=document.documentElement,g=(k,d)=>q.get(k)||localStorage.getItem('rnr-pv-'+k)||d;let t=g('theme','light');if(t==='system')t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';h.dataset.theme=t;h.dataset.accent=g('accent','midnight');h.dataset.density=g('density','comfortable');h.dataset.motion=matchMedia('(prefers-reduced-motion:reduce)').matches?'flat':g('motion','full')}catch(e){}})()</script>
<link rel="stylesheet" href="${base}fonts/fonts.css">
<link rel="stylesheet" href="${base}tokens.css">
<link rel="stylesheet" href="${base}components/bundle.css">
<link rel="stylesheet" href="${base}preview.css">
</head>
<body>
${sprite}${defs}
${bar(base, nav)}
<main class="pv">
${body}
</main>
<script src="${base}preview.js"></script>
</body>
</html>
`

const section = (name, title, sub, html, readme) => `<section class="pv-sec" id="${name}" aria-labelledby="${name}-h">
<h2 id="${name}-h">${title}</h2>
<p class="pv-sub">${sub} · <a href="${readme}">Spec (README)</a></p>
${expand(html)}
</section>`

const all = []
for (const [name, title, sub] of COMPONENTS) {
  const html = readFileSync(new URL(`components/${name}/states.html`, design), 'utf8')
  all.push(section(name, title, sub, html, `components/${name}/README.md`))
  writeFileSync(new URL(`components/${name}/preview.html`, design),
    page({ title: `${title} · ReportNoReport design`, base: '../../', nav: '<nav class="pv-nav" aria-label="Preview"><a href="../../preview.html">All components</a></nav>',
      body: section(name, title, sub, html, 'README.md') }))
}
writeFileSync(new URL('preview.html', design), page({
  title: 'ReportNoReport design system: living preview', base: '',
  nav: `<nav class="pv-nav" aria-label="Components">${COMPONENTS.map(([n, t]) => `<a href="#${n}">${t.split(',')[0].split(' and ')[0]}</a>`).join('')}</nav>`,
  body: all.join('\n'),
}))
console.log(`wrote design/preview.html and ${COMPONENTS.length} component previews`)
