<script>
    import { onMount } from 'svelte';
    import { labelFor } from '../../shared/schema.js';
    import { api, ApiError } from '../lib/api.js';
    import { EditorState, setEditor } from '../lib/editor.svelte.js';
    import { clearFlash } from '../lib/flash.svelte.js';
    import Field from './Field.svelte';
    
    // The shared state for this editing session; every component below can reach it.
    const editor = setEditor(new EditorState());

    let loading = $state(true); // waiting for the content
    let loadError = $state(''); // message if loading failed

    async function load() {
        loading = true;
        loadError = '';
        try {
            editor.load(await api.site());
        } catch (e) {
            // A 401 means the session expired: App.svelte already shows the login screen.
            if (!(e instanceof ApiError && e.status === 401)) {
                loadError = 'No se ha podido cargar el contenido de tu web. Inténtalo de nuevo en un momento.';
            }
        }
        loading = false;
    }
    
    // onMount runs once, when the editor first appears.
    onMount(() => {
        load();
    });
    
    function discard() {
        if (!confirm('¿Descartar todos los cambios que no has publicado?')) return;
        clearFlash();
        load();
    }
</script>

<div class="max-w-4xl mx-auto px-4 py-10">
    <div class="mb-8">
        <h1 class="text-3xl font-bold">Editar la web</h1>
        <p class="text-base-content/60 mt-1">
            {#if editor.config}
                Cambia los textos e imágenes de {editor.config.site.name}. Cuando termines, pulsa «Publicar».
            {:else}
                Cambia los textos e imágenes de tu web.
            {/if}
        </p>
    </div>

    {#if loading}
        <div class="flex justify-center py-24">
            <span class="loading loading-spinner loading-lg"></span>
        </div>
    {:else if loadError}
        <div class="card bg-base-100 shadow-sm">
            <div class="card-body items-center text-center">
                <p>{loadError}</p>
                <button type="button" class="btn btn-primary mt-2" onclick={load}>Reintentar</button>
            </div>
        </div>
    {:else if editor.config}
        <!-- Links to each section, sticky at the top while scrolling. -->
        <nav class="sticky top-0 z-10 -mx-4 px-4 py-2 mb-6 flex items-center gap-1 overflow-x-auto bg-base-200/95 backdrop-blur border-b border-base-300">
            {#each editor.config.sections as section (section.name)}
                <a href="#{section.name}" class="btn btn-ghost btn-sm rounded-full shrink-0">{labelFor(section)}</a>
            {/each}
        </nav>

        <!-- novalidate: turn off the browser's own error bubbles. -->
        <form
          class="flex flex-col gap-8"
          onsubmit={(e) => e.preventDefault()}
          novalidate
        >
            <!-- One collapsible card per section (Inicio, Acerca de...), built from cms.config.json. -->
            {#each editor.config.sections as section (section.name)}
                <details open class="card bg-base-100 shadow-sm group scroll-mt-20" id={section.name}>
                    <summary class="flex items-center justify-between gap-2 px-6 py-6 group-open:pb-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div>
                            <h2 class="card-title">{labelFor(section)}</h2>
                            {#if section.description}
                                <p class="text-sm text-base-content/60 mt-1">{section.description}</p>
                            {/if}
                        </div>
                        <!-- Chevron that flips when the card opens or closes. -->
                        <svg xmlns="http://www.w3.org/2000/svg" class="size-5 shrink-0 text-base-content/40 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </summary>
                    <div class="card-body pt-2">
                        <!-- `record` is this section's content object; each Field reads and writes its own key in it. -->
                        {#each section.fields as field (field.name)}
                            <Field {field} record={editor.content[section.name]} path={[section.name]} />
                        {/each}
                    </div>
                </details>
            {/each}

            <!-- The action bar, sticky at the bottom of the screen. -->
            <div class="sticky bottom-0 z-10 -mx-4 px-4 py-3 flex flex-wrap items-center justify-end gap-3 bg-base-200/95 backdrop-blur border-t border-base-300">
                {#if editor.dirty}
                    <span class="badge badge-warning badge-soft mr-auto">Tienes cambios sin publicar</span>
                {/if}
                <button type="button" class="btn btn-ghost" onclick={discard} disabled={!editor.dirty}>Descartar cambios</button>
                {#if editor.config.site.url}
                    <a href={editor.config.site.url} target="_blank" rel="noopener" class="btn btn-outline">Ver la web</a>
                {/if}
            </div>
        </form>
    {/if}
</div>
