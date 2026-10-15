import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { checkValue, imagePrefix } from '../../shared/schema.js';
import { imageUrl } from './api.js';

// Keys starting with "_" (like each item's `_key`) are for the editor only. This
// function, passed to JSON.stringify, leaves them out of anything sent or compared.
const withoutPrivate = (key, value) => (key.startsWith('_') ? undefined : value);

export const serialize = (content) => JSON.stringify(content, withoutPrivate);

export const pathKey = (path) => path.join('.');

let nextId = 0;

export const newKey = () => `k${++nextId}`;

function addKeys(fields, value) {
    for (const field of fields) {
        if (field.type !== 'collection') continue;
        if (!Array.isArray(value[field.name])) value[field.name] = [];
        for (const item of value[field.name]) {
            item._key = newKey();
            addKeys(field.itemFields, item); // nested collections too
        }
    }
    return value;
}

export class EditorState {
    // $state makes a value "reactive": when it changes, the page parts using it update.
    // With objects and arrays it reaches every level, so `content.inicio.collages.push(x)`
    // updates the collage list on screen.
    
    sha = $state('');
    config = $state.raw(null);
    content = $state({});
    errors = $state({});
    pending = new SvelteMap();
    original = $state('');
    dirty = $derived(this.config !== null && serialize(this.content) !== this.original);
    load(data) {
        // Free the temporary preview URLs of images that were pending.
        for (const { url } of this.pending.values()) URL.revokeObjectURL(url);
        this.pending.clear();
        this.errors = {};
        this.sha = data.sha;
        this.config = data.config;
        const content = {};
        for (const section of data.config.sections) {
            content[section.name] = addKeys(section.fields, { ...(data.content[section.name] ?? {}) });
        }
        this.content = content;
        this.original = serialize(this.content);
    }

    addImage(file) {
        const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        // createObjectURL gives a temporary "blob:" address for showing the file in an <img>.
        this.pending.set(id, { file, url: URL.createObjectURL(file) });
        return `new:${id}`;
    }

    imageSrc(value) {
        if (typeof value !== 'string' || !value) return null;
        if (value.startsWith('new:')) return this.pending.get(value.slice(4))?.url ?? null;
        return imageUrl(value, this.sha);
    }

    clearError(path) {
        delete this.errors[pathKey(path)];
    }
    
    validate() {
        const errors = {};
        const prefix = imagePrefix(this.config);
        // Visits every field of a section or item; recurses into collections.
        const walk = (fields, value, path) => {
            for (const field of fields) {
                const v = value?.[field.name];
                if (field.type === 'collection') {
                    (Array.isArray(v) ? v : []).forEach((item, i) => walk(field.itemFields, item, [...path, field.name, i]));
                    continue;
                }
                // A "new:" image has no real path yet; it's valid as long as one was picked.
                const pending = field.type === 'image' && typeof v === 'string' && v.startsWith('new:');
                const error = pending ? null : checkValue(field, v, prefix);
                if (error) errors[pathKey([...path, field.name])] = error;
            }
        };
        for (const section of this.config.sections) walk(section.fields, this.content[section.name], [section.name]);
        this.errors = errors;
        return Object.keys(errors).length === 0;
    }

    publishForm() {
        const form = new FormData();
        const json = serialize(this.content);
        form.append('payload', JSON.stringify({ baseSha: this.sha, content: JSON.parse(json) }));
        for (const [id, { file }] of this.pending) {
            if (json.includes(`"new:${id}"`)) form.append(`image:${id}`, file, file.name);
        }
        return form;
    }
}

// Sharing the state through context.
const KEY = Symbol('editor');export const setEditor = (state) => setContext(KEY, state);
export const getEditor = () => getContext(KEY);
