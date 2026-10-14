import { parseConfig } from '../shared/schema.js';

const CONFIG_FILE = 'imprenta.config.json';

export async function configAt(gh, sha) {
    const cached = configCache.get(sha);
    if (cached) return cached;
    const text = await gh.text(CONFIG_FILE, sha);
    if (!text) throw new Error(`The repo has no ${CONFIG_FILE}.`);
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
