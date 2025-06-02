// dev/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',   // listen on all interfaces
    port: 5173,        // front‑end URL is http://VM_IP:5173
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,           // enable WebSocket proxying
        changeOrigin: true,
      },
    },
  },
})
