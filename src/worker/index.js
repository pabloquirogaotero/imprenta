import { Hono } from 'hono';
import {
    currentUser,
    endSession,
    getUser,
    startSession,
    verifyPassword,
} from './auth.js';
import { GitHub } from './github.js';
import { loadSite } from './site.js'

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

app.notFound((c) => c.json({ error: 'not-found' }, 404));

export default app;
