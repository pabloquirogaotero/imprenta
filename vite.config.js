import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
    plugins: [svelte(), tailwindcss()],
    server: {    port: 5173,
        // In development the editor runs here (localhost:5173) and the API runs in
        // `wrangler dev` (127.0.0.1:8787). This forwards /api calls to it, so the browser
        // sees a single site, the same as in production, and the login cookie works.
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8787',
                // Keep the browser's own address (localhost:5173) on forwarded requests.
                // Vite's shorthand ('/api': 'http://...') would replace it with the Worker's,
                // and the Worker would then see "Origin: localhost:5173" on a request it thinks
                // was sent to 127.0.0.1:8787, take it for another site, and refuse every login,
                // logout and publish (its CSRF protection, see src/worker/index.js).
                changeOrigin: false,
            },
        },
    },
    // `npm run build` writes the finished editor here; Wrangler serves it from there.
    build: { outDir: 'dist', emptyOutDir: true },
});
