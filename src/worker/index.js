import { Hono } from 'hono';
import { GitHub } from './github.js';
import { loadSite } from './site.js'

const app = new Hono().basePath('/api');

const REPO = 'pabloquirogaotero/imprenta-test-site';

app.get('/site', async (c) => {
    const site = await loadSite(new GitHub(c.env, REPO), { branch: 'main' });
    return c.json(site, 200, {
        'Cache-Control': 'no-store'
    });
});

export default app;
