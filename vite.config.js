import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
    plugins: [svelte(), tailwindcss()],
    server: {    port: 5173,
        // In development the editor runs here (localhost:5173) and the API runs in
        // `wrangler dev` (127.0.0.1:8787). This forwards /api calls to it, so the browser
        // sees a single site, the same as in production, and the login cookie works.
        proxy: { '/api': 'http://127.0.0.1:8787' },
    },
    // `npm run build` writes the finished editor here; Wrangler serves it from there.
    build: { outDir: 'dist', emptyOutDir: true },
});
