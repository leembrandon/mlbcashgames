import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // In local dev, Vite proxies /api to the Vercel dev server.
    // Run "npx vercel dev" instead of "npm run dev" to test
    // both the frontend and API routes together locally.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
