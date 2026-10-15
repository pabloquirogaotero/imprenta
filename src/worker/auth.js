import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const COOKIE = 'cms_session'; // the session cookie's name
const SHORT_SESSION = 60 * 60 * 12; // 12 hours, in seconds
const LONG_SESSION = 60 * 60 * 24 * 30; // 30 days, with "Recordarme" ticked
const MAX_FAILURES = 5; // wrong passwords allowed...
const LOCKOUT_SECONDS = 15 * 60; // ...per 15 minutes

const encoder = new TextEncoder();

// ---- Base64 helpers. -------------------------------------------------------

function toB64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (const b of arr) s += String.fromCharCode(b);
    return btoa(s);
}

function fromB64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

const toB64Url = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (s) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/'));

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

// ---- Passwords. ------------------------------------------------------------

export async function verifyPassword(password, stored) {
    const [scheme, iterations, salt, hash] = stored.split('$');
    if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false;
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations: Number(iterations) },
        key,
        256, // 256 bits = 32 bytes of hash
    );
    return timingSafeEqual(new Uint8Array(bits), fromB64(hash));
}

// ---- Users. ----------------------------------------------------------------

export async function getUser(env, email) {
    return env.USERS.get(`user:${email.trim().toLowerCase()}`, 'json');
}

// ---- Sessions. -------------------------------------------------------------

async function hmacKey(secret) {
    return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
        'verify',
    ]);
}

export async function startSession(c, email, remember) {
    const maxAge = remember ? LONG_SESSION : SHORT_SESSION;
    const payload = toB64Url(encoder.encode(JSON.stringify({ e: email, x: Date.now() + maxAge * 1000 })));
    const signature = await crypto.subtle.sign('HMAC', await hmacKey(c.env.SESSION_SECRET), encoder.encode(payload));
    setCookie(c, COOKIE, `${payload}.${toB64Url(signature)}`, {
        httpOnly: true, // JavaScript on the page can't read it, so an injected script can't steal it
        secure: true, // only sent over HTTPS
        sameSite: 'Strict', // not sent when another site makes the request (stops CSRF)
        path: '/',
        // With maxAge the cookie survives closing the browser. Without it, the browser
        // deletes it on close (and the expiry inside caps it at 12 hours anyway).
        ...(remember ? { maxAge } : {}),
    });
}

export function endSession(c) {
    deleteCookie(c, COOKIE, { path: '/', secure: true });
}

export async function currentUser(c) {
    const cookie = getCookie(c, COOKIE);
    if (!cookie) return null;
    const [payload, signature] = cookie.split('.');
    if (!payload || !signature) return null;
    let valid = false;
    try {
        valid = await crypto.subtle.verify(
            'HMAC',
            await hmacKey(c.env.SESSION_SECRET),
            fromB64Url(signature),
            encoder.encode(payload),
        );
    } catch {
        return null; // a cookie that isn't even valid base64
    }
    if (!valid) return null;
    
    const data = JSON.parse(new TextDecoder().decode(fromB64Url(payload)));
    if (Date.now() > data.x) return null; // expired
    return getUser(c.env, data.e);
}

// ---- Login lockout ---------------------------------------------------------
// Each wrong password increments a counter "fail:<email>" in KV that expires 15 minutes
// after the last failure. At 5, logins for that email are refused until it expires.
// KV is "eventually consistent" (a write takes a moment to be visible everywhere), so
// the count is approximate under very fast attempts. That's fine for this purpose.

export async function isLockedOut(env, email) {
    const failures = Number((await env.USERS.get(`fail:${email}`)) ?? 0);
    return failures >= MAX_FAILURES;
}

export async function recordFailure(env, email) {
    const failures = Number((await env.USERS.get(`fail:${email}`)) ?? 0) + 1;
    await env.USERS.put(`fail:${email}`, String(failures), { expirationTtl: LOCKOUT_SECONDS });
}

export async function clearFailures(env, email) { 
    await env.USERS.delete(`fail:${email}`);
}
