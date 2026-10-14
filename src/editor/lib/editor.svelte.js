import { getContext, setContext } from 'svelte';

// Keys starting with "_" (like each item's `_key`) are for the editor only. This
// function, passed to JSON.stringify, leaves them out of anything sent or compared.
const withoutPrivate = (key, value) => (key.startsWith('_') ? undefined : value);

export const serialize = (content) => JSON.stringify(content, withoutPrivate);

export const pathKey = (path) => path.join('.');

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
            content[section.name] = { ...(data.content[section.name] ?? {}) };
        }
        this.content = content;
        this.original = serialize(this.content);
    }
}

// Sharing the state through context.
const KEY = Symbol('editor');export const setEditor = (state) => setContext(KEY, state);
export const getEditor = () => getContext(KEY);
