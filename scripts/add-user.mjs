#!/usr/bin/env node
/**
 * Creates (or replaces) a CMS user.
 * 
 *   npm run user:add -- --email name@example.com --name Name --repo your-user/your-site --password '…'
 *   npm run user:add -- ... --remote        # write to the deployed Worker's KV
 *
 * Takes the password from --password, hashes it (PBKDF2-SHA256, the same
 * format the Worker checks) and stores the user in the USERS KV namespace.
 * Without --remote it writes to local storage, used by `npm run dev`.
 */
import { spawnSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { parseArgs } from 'node:util';

// Read the command-line options (--email, --name...) with Node's built-in parser.
const { values } = parseArgs({
    options: {
        email: { type: 'string' },
        name: { type: 'string' },
        repo: { type: 'string' },
        branch: { type: 'string', default: 'main' },
        password: { type: 'string' },
        remote: { type: 'boolean', default: false },
        iterations: { type: 'string', default: '20000' },
    },
});

if (!values.email || !values.name || !values.repo) {
    console.error('Usage: npm run user:add -- --email <email> --name <name> --repo <owner/repo> --password <password> [--branch main] [--remote]');
    process.exit(1);
}
if (!/^[\w.-]+\/[\w.-]+$/.test(values.repo)) {
    console.error('--repo must look like owner/name');
    process.exit(1);
}

const password = values.password;
if (!password) {
    console.error('Give the password with --password "..."');
    process.exit(1);
}
if (password.length < 10) {
    console.error('Use at least 10 characters.');
    process.exit(1);
}

// Workers' free plan allows ~10 ms of CPU per request; 20,000 iterations take ~5 ms.
// On a paid plan this could be raised to 100000 (the maximum Workers supports).
const ITERATIONS = Math.min(100000, Math.max(10000, Number(values.iterations)));
// Hash the password exactly the way src/worker/auth.js checks it:
// "pbkdf2$<iterations>$<salt>$<hash>", with a fresh random salt for this user.
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

// The user record, stored in KV under "user:<email>" (emails lowercased).
const email = values.email.trim().toLowerCase();
const user = {
    email,
    name: values.name,
    passwordHash: `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`,
    repo: values.repo,
    branch: values.branch,
};

// Save it with Wrangler: --local writes to .wrangler/state (used by `npm run dev`),
// --remote writes to the real KV store on Cloudflare.
const result = spawnSync(
    'npx',
    ['wrangler', 'kv', 'key', 'put', '--binding', 'USERS', `user:${email}`, JSON.stringify(user), values.remote ? '--remote' : '--local'],
    { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`\n✓ ${values.name} can now sign in as ${email} to edit ${values.repo} (${values.branch})${values.remote ? '' : ' — locally'}.`);
