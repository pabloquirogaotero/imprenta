<script>
    import { tick } from 'svelte';
    import { emptyItem, labelFor } from '../../shared/schema.js';
    import { getEditor, newKey, pathKey } from '../lib/editor.svelte.js';
    import { sortable } from '../lib/sortable.js';
    import Field from './Field.svelte';
    
    let { field, items, path } = $props();

    const editor = getEditor();
    let list = $state(); // the list's DOM element (filled in by bind:this below)
    
    const itemFields = $derived(field.itemFields);
    const itemLabel = $derived(field.itemLabel ?? 'elemento');

    // The card's thumbnail comes from the item's first image field, if it has one.
    const thumbnailField = $derived(itemFields.find((f) => f.type === 'image'));
    // The card's title comes from its first required text field, or else its first text field.
    const titleField = $derived(
        itemFields.find((f) => (f.type === 'text' || f.type === 'longtext') && f.required) ??
        itemFields.find((f) => f.type === 'text' || f.type === 'longtext'),
    );
    
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    
    function title(item, index) {
        const value = titleField ? String(item[titleField.name] ?? '').split('\n')[0].trim() : '';
        return value || `${capitalize(itemLabel)} ${index + 1}`;
    }

    function hasError(index) {
        const prefix = pathKey([...path, index]) + '.';
        return Object.keys(editor.errors).some((key) => key.startsWith(prefix));
    }
    
    async function add() {
        const key = newKey();
        items.push({ ...emptyItem(itemFields), _key: key });
        await tick(); // wait for Svelte to draw the new card
        const added = list?.querySelector(`[data-key="${key}"]`);
        if (added) {
            added.open = true;
            added.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    function remove(index) {
        if (!confirm(`¿Eliminar «${title(items[index], index)}»?`)) return;
        items.splice(index, 1);
        // Error messages are stored by position, which just changed, so clear them.
        editor.errors = {};
    }

    function move(from, to) {
        const [item] = items.splice(from, 1);
        items.splice(to, 0, item);
        editor.errors = {};
    }
</script>

<div class="bg-base-200 rounded-box p-3">
    <div class="flex items-center justify-between gap-2 mb-2">
        <span class="font-semibold text-sm">{labelFor(field)}</span>
        <button type="button" class="btn btn-ghost btn-xs" onclick={add}>
            <svg xmlns="http://www.w3.org/2000/svg" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 5v14M5 12h14" />
            </svg>
            Añadir {itemLabel}
        </button>
    </div>
    <div class="flex flex-col gap-2" bind:this={list} use:sortable={move}>
        <!--
            (item._key) tells Svelte which card is which, so reordering moves the existing
            cards instead of rebuilding them (an open card stays open).
        -->
        {#each items as item, index (item._key)}
            <details
              class="js-item bg-base-100 rounded-box shadow-sm group/item"
              class:ring-2={hasError(index)}
              class:ring-error={hasError(index)}
              data-key={item._key}
            >
                <summary class="flex items-center gap-2 p-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <!--
                        The six-dot drag handle. preventDefault stops a click on it from also
                        opening/closing the card.
                    -->
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                    <span
                      class="js-drag-handle cursor-grab touch-none text-base-content/40 p-1 -m-1"
                      title="Arrastra para cambiar el orden"
                      onclick={(e) => e.preventDefault()}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                            <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
                            <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
                            <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
                            <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
                            <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
                            <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
                        </svg>
                    </span>
                    {#if thumbnailField}
                        {@const src = editor.imageSrc(item[thumbnailField.name])}
                        {#if src}
                            <img {src} alt="" class="size-8 rounded object-cover shrink-0" />
                        {:else}
                            <div class="size-8 rounded bg-base-200 shrink-0"></div>
                        {/if}
                    {/if}
                    <span class="flex-1 text-sm font-medium truncate">{title(item, index)}</span>
                    <!-- Delete. stopPropagation keeps the click from toggling the card too. -->
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square"
                      title="Eliminar"
                      aria-label="Eliminar {title(item, index)}"
                      onclick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        remove(index);
                        }
                      }
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                        </svg>
                    </button>
                    <svg xmlns="http://www.w3.org/2000/svg" class="size-4 shrink-0 text-base-content/40 transition-transform group-open/item:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </summary>
                <!-- The item's fields. The path gains the item's position. -->
                <div class="flex flex-col gap-2 px-2 pb-2 pt-1 border-t border-base-200">
                    {#each itemFields as itemField (itemField.name)}
                        <Field field={itemField} record={item} path={[...path, index]} />
                    {/each}
                </div>
            </details>
        {:else}
            <p class="text-sm text-base-content/50 px-1">Todavía no hay ninguno.</p>
        {/each}
    </div>
</div>
