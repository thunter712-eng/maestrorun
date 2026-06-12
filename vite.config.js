import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://thunter712-eng.github.io/maestrorun/
export default defineConfig({
  base: '/maestrorun/',
  plugins: [react()],
})
