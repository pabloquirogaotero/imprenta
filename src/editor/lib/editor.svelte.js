import { getContext, setContext } from 'svelte';

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
    original = $state('');
    dirty = $derived(this.config !== null && serialize(this.content) !== this.original);
    load(data) {
        this.sha = data.sha;
        this.config = data.config;
        const content = {};
        for (const section of data.config.sections) {
            content[section.name] = addKeys(section.fields, { ...(data.content[section.name] ?? {}) });
        }
        this.content = content;
        this.original = serialize(this.content);
    }

    publishForm() {
        const form = new FormData();
        form.append('payload', JSON.stringify({ baseSha: this.sha, content: JSON.parse(serialize(this.content)) }));
        return form;
    }
}

// Sharing the state through context.
const KEY = Symbol('editor');export const setEditor = (state) => setContext(KEY, state);
export const getEditor = () => getContext(KEY);
