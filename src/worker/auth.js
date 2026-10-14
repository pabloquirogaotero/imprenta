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
