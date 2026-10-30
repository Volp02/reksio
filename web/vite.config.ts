import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: API eines laufenden Servers über REKSIO_API (in .env.local, nicht im Repo)
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '')
    return {
        plugins: [react()],
        base: './',
        server: {
            host: true,
            proxy: { '/api': { target: env.REKSIO_API ?? 'http://localhost:8050', changeOrigin: true } },
        },
    }
})
