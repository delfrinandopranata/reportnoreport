import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

// Vercel's Supabase integration only provides NEXT_PUBLIC_ names; Vite reads VITE_ ones from process.env.
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
  const fallback = process.env[`NEXT_PUBLIC_${name}`]
  if (!process.env[`VITE_${name}`] && fallback) process.env[`VITE_${name}`] = fallback
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { rollupOptions: { input: { home: `${root}index.html`, app: `${root}app/index.html` } } },
})
