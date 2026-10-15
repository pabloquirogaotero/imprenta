import { imagePrefix, isImagePath, labelFor, parseConfig, sectionSchema } from '../shared/schema.js';

const CONFIG_FILE = 'imprenta.config.json';

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

export async function publish(gh, user, baseSha, submitted) {
    // 1. Conflict check. If the branch moved since the editor loaded (someone published
    // from another tab, or the developer pushed), refuse instead of overwriting.
    // This is "optimistic concurrency": no locks, just "stop if it changed".
    const head = await gh.headSha(user.branch);
    if (head !== baseSha) throw new PublishError(409, { error: 'conflict' });
    
    // 2. Read the rules from the repo itself, never from the browser.
    const config = await configAt(gh, head);
    
    // 3. The current content, to compare against.
    const old = await contentAt(gh, config, head);
    
    // 4. Validate every section with the shared rules. If anything is wrong, answer 422
    // with the list of problems.
    const issues = [];
    const validated = {};
    for (const section of config.sections) {
        const result = sectionSchema(section, config).safeParse(submitted[section.name] ?? {});
        if (result.success) validated[section.name] = result.data;
        else for (const issue of result.error.issues) issues.push({ section: section.name, path: issue.path, message: issue.message });
    }
    if (issues.length) throw new PublishError(422, { error: 'invalid', issues });
    
    // 5. Work out which files changed. Each section is written exactly as it will be
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
    
    // 6. Nothing changed: no commit (and no pointless site rebuild).
    if (!changes.length) return { sha: head, changed: false };
    
    // 7. Make the commit, authored as the CMS user.
    let sha;
    try {
        sha = await gh.commit({
            branch: user.branch,
            parentSha: head,
            message: `Actualiza ${changedLabels.join(', ')} desde Imprenta`, // "Actualiza Inicio, Contacto desde Imprenta"
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
