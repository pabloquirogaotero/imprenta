import { Hono } from 'hono';

const app = new Hono().basePath('/api');

app.get('/hello', (c) => c.json({ hello: 'world' }));

export default app;
