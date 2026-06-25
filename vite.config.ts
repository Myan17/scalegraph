import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub Pages repo path for deploy
export default defineConfig({
  plugins: [react()],
  base: '/scalegraph/',
})
