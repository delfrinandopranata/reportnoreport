// scripts/check-dist.mjs
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_IMAGE_BYTES = 200 * 1024
const IMAGE = /\.(png|jpe?g|webp|avif|gif|ico)$/i

export const findSecrets = (text) => ['service_role', 'sb_secret_'].filter((s) => text.includes(s))
export const findMissingAlt = (html) => (html.match(/<img\b[^>]*>/gi) ?? []).filter((tag) => !/\balt\s*=/i.test(tag))
export const findPlaceholders = (text) => text.match(/\[(?:Company name|Governing law|TBD|TODO)[^\]]*\]/g) ?? []

export const internalRefs = (html) =>
  [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((r) => r.startsWith('/') && !r.startsWith('//'))

export const resolveRef = (ref, _fromFile, exists) => {
  const path = ref.split(/[?#]/)[0].replace(/^\//, '')
  if (path === '' || path.endsWith('/')) return exists(`${path}index.html`)
  return exists(path) || exists(`${path}.html`) || exists(`${path}/index.html`)
}

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

export function checkDist(dir) {
  const problems = []
  const exists = (p) => existsSync(join(dir, p))
  for (const file of walk(dir)) {
    const rel = relative(dir, file)
    if (IMAGE.test(rel)) {
      const size = statSync(file).size
      if (size > MAX_IMAGE_BYTES) problems.push(`${rel}: image is ${Math.round(size / 1024)} KB (max 200 KB)`)
      continue
    }
    if (!/\.(html|js|css|xml|txt|json)$/.test(rel)) continue
    const text = readFileSync(file, 'utf8')
    for (const s of findSecrets(text)) problems.push(`${rel}: contains "${s}"`)
    if (!rel.endsWith('.html')) continue
    for (const p of findPlaceholders(text)) problems.push(`${rel}: placeholder ${p}`)
    for (const tag of findMissingAlt(text)) problems.push(`${rel}: <img> without alt: ${tag}`)
    for (const ref of internalRefs(text)) if (!resolveRef(ref, rel, exists)) problems.push(`${rel}: broken link ${ref}`)
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkDist(process.argv[2] ?? 'dist')
  for (const p of problems) console.error(p)
  if (problems.length) process.exit(1)
  console.log('check-dist: ok')
}
