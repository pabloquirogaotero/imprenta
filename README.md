# Imprenta

A small Git-based CMS for static websites, built for people who shouldn't have to know what Git is.

Each user signs in and edits their site's texts, images and lists on a single page. When they press **Publicar**, Imprenta makes one commit to the site's GitHub repository, and the site's host (Cloudflare Pages, for example) rebuilds and publishes it a minute or two later.

The CMS stores nothing but users. All content lives in each site's own repository, as JSON files next to the code that renders them.

```
Editor (Svelte, in the browser)
   │  /api/*  (same origin, session cookie)
   ▼
Worker (Hono on Cloudflare Workers) ── users and login attempts in KV
   │  GitHub REST API: one commit per publish
   ▼
Site repo: imprenta.config.json + content JSON + images
   │  push
   ▼
The site's host rebuilds and serves it
```

The editor's interface is in Spanish; the code and this README are in English.

## How publishing works

1. The editor loads the branch's latest commit: `imprenta.config.json` (what can be edited) and one JSON file per section (the content). It remembers that commit's sha.
2. The user edits. Photos are resized in the browser (2400 px at most on the longest side, WebP) and only shown as previews; nothing is uploaded yet.
3. **Publicar** checks every field in the browser and sends the content and the new photos in one request.
4. The Worker refuses if the branch has moved since the editor loaded it (another tab, or a developer's push): the user gets a conflict warning instead of overwriting anything.
5. It validates everything again with the same rules, reading the config from the repository, never from the browser.
6. It writes a single commit with the changed JSON files, the new images still in use, and the deletion of images no longer used. If nothing changed, there's no commit and no rebuild.
7. The branch is moved without `force`, so a push that lands in between is refused, not overwritten.

## Security

- Passwords are hashed with PBKDF2-SHA256 and a random salt per user. A login for an email that doesn't exist still hashes a dummy password, so response times don't reveal which emails have accounts.
- Five wrong passwords lock that email out until 15 minutes after the last attempt.
- Sessions are HMAC-signed cookies: `HttpOnly`, `Secure`, `SameSite=Strict`, for 12 hours or 30 days with "Recordarme". Requests that change data from another origin are refused, on top of `SameSite`.
- Image paths are checked against a strict pattern inside the image folder, so a crafted path like `images/../../package.json` can't read or delete other files. Uploaded files are identified by their bytes, not their name, and capped at 15 MB.
- The GitHub token only ever lives in the Worker.

## Project layout

```
src/worker/index.js        the API routes, the origin check and error handling
src/worker/auth.js         passwords, sessions, login lockout
src/worker/site.js         loading a site and publishing it as one commit
src/worker/github.js       the GitHub REST calls (files, blobs, trees, commits, refs)
src/shared/schema.js       the config and content rules, shared by the Worker and the editor
src/editor/                the editor (Svelte 5, Tailwind 4, daisyUI 5 "cmyk" theme)
scripts/add-user.mjs       creates users
```

## Making a site editable

Add an `imprenta.config.json` at the root of the site's repository:

```json
{
  "site": { "name": "Estudio Papel", "url": "https://example.com" },
  "contentDir": "src/content",
  "imageDir": "src/content/images",
  "sections": [
    {
      "name": "inicio",
      "label": "Inicio",
      "description": "La portada.",
      "file": "inicio.json",
      "fields": [
        { "name": "headline", "label": "Frase de portada", "type": "text", "required": true },
        {
          "name": "works",
          "label": "Obras",
          "type": "collection",
          "itemLabel": "obra",
          "itemFields": [
            { "name": "image", "label": "Imagen", "type": "image", "required": true },
            { "name": "title", "label": "Título", "type": "text" },
            { "name": "link", "label": "Enlace de compra", "type": "url", "placeholder": "https://" }
          ]
        }
      ]
    }
  ]
}
```

- Each section is one file, `<contentDir>/<file>`, holding an object with one key per field.
- `imageDir` must be inside `contentDir`. Images are stored relative to `contentDir` (`"images/retrato-75d7b9.webp"`), so the site resolves them from there.
- Field types: `text`, `longtext`, `image`, `url`, `email` and `collection` (a reorderable list of items, each with its own `itemFields`, which can be collections too).
- Any field can have `label`, `required`, `help` (shown under it) and `placeholder`. Without a `label`, the name is made readable (`socialLinks` → "Social links").

The site renders the JSON however it likes. [soniaotero.com](https://soniaotero.com), built with Astro, is the first site using Imprenta.

## Run it locally

You need Node 22 or later, a GitHub token and a repository with an `imprenta.config.json`.

1. `npm install`
2. Copy `.dev.vars.example` to `.dev.vars` and fill it in:
   - `GITHUB_TOKEN`: a fine-grained personal access token with **Contents: Read and write** on the site repositories.
   - `SESSION_SECRET`: a long random string, for example from `openssl rand -base64 32`.
3. Create a user in the local KV store (it asks for the password twice):
   ```bash
   npm run user:add -- --email ana@example.com --name Ana --repo your-user/your-site
   ```
4. `npm run dev`, and open <http://localhost:5173>.

`npm run dev` runs the Worker (`wrangler dev`, port 8787) and the editor (Vite, port 5173) together; Vite forwards `/api` to the Worker, so the browser sees a single site, as in production. Use Chrome or Firefox: Safari refuses `Secure` cookies on `http://localhost`.

**Publishing locally commits to the real repository.** Point the user at a test repository or branch (`--branch`) while trying things out.

If a login fails, the `wrangler dev` output says why (no such user, or wrong password); the browser always gets the same generic message.

## Deploy to Cloudflare Workers

1. Create the KV namespace and put its id in `wrangler.jsonc` (`kv_namespaces`):
   ```bash
   npx wrangler kv namespace create USERS
   ```
2. Set the secrets:
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put SESSION_SECRET
   ```
3. `npm run deploy` builds the editor and deploys the Worker, which serves both the editor and `/api`.
4. Create the real users with `--remote`:
   ```bash
   npm run user:add -- --email ana@example.com --name Ana --repo your-user/your-site --remote
   ```

To follow the Worker's logs in production: `npx wrangler tail`.

On the Workers free plan a request gets about 10 ms of CPU, so passwords are hashed with 20,000 PBKDF2 iterations (about 5 ms). On a paid plan, raise it with `--iterations` (up to 100,000) when creating users.
