import { collectImages, imagePrefix, isImagePath, labelFor, parseConfig, sectionSchema } from '../shared/schema.js';

const CONFIG_FILE = 'imprenta.config.json';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

const NEW_IMAGE = /^new:([-0-9A-Za-z]{1,64})$/;

export class PublishError extends Error {
    constructor(status, body) {
        super(String(body.error));
        this.status = status;
        this.body = body;
    }
}

// ---- Loading. --------------------------------------------------------------

export async function configAt(gh, sha) {
    const cached = configCache.get(sha);
    if (cached) return cached;
    const text = await gh.text(CONFIG_FILE, sha);
    if (!text) throw new PublishError(500, { error: 'no-config', message: `The repo has no ${CONFIG_FILE}.` });
    const config = parseConfig(JSON.parse(text));
    configCache.set(sha, config);
    return config;
}

async function contentAt(gh, config, sha) {
    // Promise.all fetches all the files at the same time instead of one after another.
    const files = await Promise.all(config.sections.map((s) => gh.text(`${config.contentDir}/${s.file}`, sha)));
    const content = {};  const raw = {};
    config.sections.forEach((section, i) => {
        raw[section.name] = files[i];
        content[section.name] = files[i] ? JSON.parse(files[i]) : {};
    });
    return { content, raw };
}

export async function loadSite(gh, user) {
    const sha = await gh.headSha(user.branch);
    const config = await configAt(gh, sha); 
    const { content } = await contentAt(gh, config, sha);
    return { sha, config, content };
}

export async function readImage(gh, path, ref) {
    const config = await configAt(gh, ref);
    if (!isImagePath(path, imagePrefix(config))) return null;
    return gh.file(`${config.contentDir}/${path}`, ref);
}

// ---- Publishing. -----------------------------------------------------------

export async function publish(gh, user, baseSha, submitted, uploads) {
    // 1. Conflict check. If the branch moved since the editor loaded (someone published
    // from another tab, or the developer pushed), refuse instead of overwriting.
    // This is "optimistic concurrency": no locks, just "stop if it changed".
    const head = await gh.headSha(user.branch);
    if (head !== baseSha) throw new PublishError(409, { error: 'conflict' });
    
    // 2. Read the rules from the repo itself, never from the browser.
    const config = await configAt(gh, head);
    const prefix = imagePrefix(config);
    
    // 3. The current content, to compare against.
    const old = await contentAt(gh, config, head);
    
    // 4. Give every new image a permanent file name, and put that name in the content in
    // place of its "new:<id>" placeholder.
    const newImages = new Map(); // id → { path, file }
    const assignImage = async (placeholder) => {
        const id = NEW_IMAGE.exec(placeholder)[1];
        const existing = newImages.get(id);
        if (existing) return existing.path; // the same image used in two places
        const file = uploads.get(id);
        if (!file) throw new PublishError(400, { error: 'missing-upload', message: `No file sent for ${placeholder}` });
        // Decide the file type from its actual bytes, not from its name.
        const ext = await imageExtension(file);
        if (!ext) throw new PublishError(422, { error: 'bad-image', message: 'Ese archivo no es una imagen válida.' });
        if (file.size > MAX_IMAGE_BYTES) {
            throw new PublishError(422, { error: 'bad-image', message: 'La imagen es demasiado grande.' });
        }
        // e.g. "Foto del estudio.webp" → "images/foto-del-estudio-75d7b9.webp"
        const path = `${prefix}${slug(file.name)}-${randomId()}.${ext}`;
        newImages.set(id, { path, file });
        return path;
    };
    const resolved = {};
    for (const section of config.sections) {
        resolved[section.name] = await replaceImages(section.fields, submitted[section.name] ?? {}, assignImage);
    }

    // 5. Validate every section with the shared rules. If anything is wrong, answer 422
    // with the list of problems; the editor marks those fields in red.
    const issues = [];
    const validated = {};
    for (const section of config.sections) {
        const result = sectionSchema(section, config).safeParse(resolved[section.name]);
        if (result.success) validated[section.name] = result.data;
        else for (const issue of result.error.issues) issues.push({ section: section.name, path: issue.path, message: issue.message });
    }
    if (issues.length) throw new PublishError(422, { error: 'invalid', issues });

    // 6. Every image the new content uses.
    const used = new Set();
    for (const section of config.sections) collectImages(section.fields, validated[section.name], used);
    
    // 7. Work out which files changed. Each section is written exactly as it will be
    // saved (2-space indented JSON + a newline) and compared with the current file.
    const changes = [];
    const changedLabels = [];
    for (const section of config.sections) {
        const text = JSON.stringify(validated[section.name], null, 2) + '\n';
        if (text !== old.raw[section.name]) {
            changes.push({ path: `${config.contentDir}/${section.file}`, content: text });
            changedLabels.push(labelFor(section));
        }
    }
    
    // 8. Upload the new images, but only the ones still in use. An image picked and then
    // replaced before publishing is never uploaded.
    for (const { path, file } of newImages.values()) {
        if (!used.has(path)) continue;
        changes.push({ path: `${config.contentDir}/${path}`, sha: await gh.createBlob(await file.arrayBuffer()) });
    }

    // 9. Delete images that were in use before and aren't any more, so the repo doesn't
    // fill up with old photos. Only ever inside the image folder.
    const previouslyUsed = new Set();
    for (const section of config.sections) collectImages(section.fields, old.content[section.name], previouslyUsed);
    for (const path of previouslyUsed) {
        if (!used.has(path) && isImagePath(path, prefix)) {
            changes.push({ path: `${config.contentDir}/${path}`, sha: null });
        }
    }

    // 10. Nothing changed: no commit (and no pointless site rebuild).
    if (!changes.length) return { sha: head, changed: false };
    
    // 11. Make the commit, authored as the Imprenta user.
    let sha;
    try {
        sha = await gh.commit({
            branch: user.branch,
            parentSha: head,
            message: changedLabels.length
                ? `Actualiza ${changedLabels.join(', ')} desde Imprenta` // "Actualiza Inicio, Contacto desde Imprenta"
                : 'Actualiza imágenes desde Imprenta',
            author: { name: user.name, email: user.email },
            changes,
        });
    } catch (error) {
        // GitHub answers 422 when the branch moved between step 1 and now (force: false).
        // That's the same situation as a conflict.
        if (error?.status === 422) throw new PublishError(409, { error: 'conflict' });
        throw error;
    }
    
    return { sha, changed: true };
}

async function replaceImages(fields, value, assign) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = { ...value };
    for (const field of fields) {
        const v = record[field.name];
        if (field.type === 'image' && typeof v === 'string' && NEW_IMAGE.test(v)) {
            record[field.name] = await assign(v);
        }
        if (field.type === 'collection' && Array.isArray(v)) {
            record[field.name] = await Promise.all(v.map((item) => replaceImages(field.itemFields, item, assign)));
        }
    }
    return record;
}

async function imageExtension(file) {
    const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to));
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'; // JPEG starts FF D8 FF
    if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png'; // PNG starts ‰PNG
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
    if (ascii(0, 4) === 'GIF8') return 'gif';  if (ascii(4, 8) === 'ftyp' && ascii(8, 12) === 'avif') return 'avif';
    return null;
}

function slug(name) {
    const base = name
        .replace(/\.[^.]*$/, '') // drop the extension
        .normalize('NFD') // split letters from their accents ("ó" → "o" + "´")...
        .replace(/[̀-ͯ]/g, '') // ...and drop the accents
        .toLowerCase()
        .replace(/[^0-9a-z]+/g, '-') // anything else becomes a dash
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
        return base || 'imagen';
}

function randomId() {
    return crypto.randomUUID().slice(0, 6);
}
