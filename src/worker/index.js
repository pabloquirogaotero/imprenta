import { Hono } from 'hono';
import {
    currentUser,
    endSession,
    getUser,
    startSession,
    verifyPassword,
} from './auth.js';
import { GitHub, GitHubError } from './github.js';
import { loadSite, publish, PublishError, readImage } from './site.js';

const app = new Hono().basePath('/api');

// ---- Public routes. --------------------------------------------------------
app.post('/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!email || !password) return c.json({ error: 'invalid' }, 400);

    const user = await getUser(c.env, email);
    // When the user doesn't exist we still hash a dummy password. Otherwise "no such user"
    // would answer faster than "wrong password", revealing which emails have accounts.
    const ok = await verifyPassword(
        password,
        user?.passwordHash ?? 'pbkdf2$20000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    );  if (!user || !ok) {
        // The real reason goes to the server log only (the `wrangler dev` terminal, or
        // `wrangler tail` in production). The browser always gets the same generic answer.
        console.warn(user ? `Login failed: wrong password for ${email}` : `Login failed: no user ${email} (create it with npm run user:add)`);
        return c.json({ error: 'invalid' }, 401);
    }

    await startSession(c, user.email, Boolean(body.remember));
    return c.json({ name: user.name, email: user.email });
});

app.post('/logout', (c) => {
    endSession(c);
    return c.json({ ok: true });
});

// ---- Login check. ----------------------------------------------------------

app.use('*', async (c, next) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: 'unauthenticated' }, 401);
    c.set('user', user); // the routes below read it back with c.get('user')
    await next();
});

// ---- Protected routes. -----------------------------------------------------

app.get('/me', (c) => {
    const { name, email } = c.get('user');
    return c.json({ name, email });
});

app.get('/site', async (c) => {
    const user = c.get('user');
    const site = await loadSite(new GitHub(c.env, user.repo), user);
    return c.json(site, 200, {
        'Cache-Control': 'no-store'
    });
});

app.get('/image', async (c) => {
    const user = c.get('user');
    const path = c.req.query('path') ?? '';
    const ref = c.req.query('ref') ?? '';
    // Only a full 40-character commit sha is accepted as `ref`.
    if (!/^[0-9a-f]{40}$/.test(ref)) return c.json({ error: 'bad-ref' }, 400);
    
    const file = await readImage(new GitHub(c.env, user.repo), path, ref);
    if (!file) return c.json({ error: 'not-found' }, 404);
    
    const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
    const type = types[path.split('.').pop().toLowerCase()];
    // A file at a given commit can never change, so the browser may cache it for a year.
    // "private" keeps it out of shared caches, since it came from a logged-in request.
    return new Response(file.body, {
        headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=31536000, immutable' },
    });
});

app.post('/publish', async (c) => {
    const user = c.get('user');
    const form = await c.req.formData();
    const payload = JSON.parse(String(form.get('payload') ?? '{}'));
    if (!payload.baseSha || !payload.content) return c.json({ error: 'invalid' }, 400);
    const result = await publish(new GitHub(c.env, user.repo), user, payload.baseSha, payload.content);
    return c.json(result);
});

// ---- Errors. ---------------------------------------------------------------
app.onError((error, c) => {
    // Expected publishing problems (409 conflict, 422 invalid...) carry their own answer.
    if (error instanceof PublishError) return c.json(error.body, error.status);
    console.error(error);
    // GitHub refused our token: most likely it expired and needs replacing.
    if (error instanceof GitHubError && (error.status === 401 || error.status === 403)) {
        return c.json({ error: 'github-auth', message: 'The GitHub token was rejected or has expired.' }, 502);
    }
    return c.json({ error: 'server', message: String(error?.message ?? error) }, 500);
});

app.notFound((c) => c.json({ error: 'not-found' }, 404));

export default app;
