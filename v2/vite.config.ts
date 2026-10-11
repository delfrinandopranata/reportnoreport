import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const page = (p: string) => resolve(import.meta.dirname, p)

// Vercel's cleanUrls serves /unsubscribe from unsubscribe.html; dev and preview need the same mapping (mail links point at the clean URL).
const cleanUrl = (req: { url?: string }, _res: unknown, next: () => void) => {
  if (req.url && /^\/unsubscribe(\?|$)/.test(req.url)) req.url = req.url.replace('/unsubscribe', '/unsubscribe.html')
  next()
}
const cleanUrls = (): Plugin => ({
  name: 'clean-urls',
  configureServer: (s) => { s.middlewares.use(cleanUrl) },
  configurePreviewServer: (s) => { s.middlewares.use(cleanUrl) },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), cleanUrls()],
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'),
        privacy: page('privacy.html'),
        terms: page('terms.html'),
        notFound: page('404.html'),
        unsubscribe: page('unsubscribe.html'),
        app: page('app/index.html'),
      },
    },
  },
})
