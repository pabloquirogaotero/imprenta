<script>
    import { onMount, tick } from 'svelte';
    import { labelFor } from '../../shared/schema.js';
    import { api, ApiError } from '../lib/api.js';
    import { EditorState, pathKey, setEditor } from '../lib/editor.svelte.js';
    import { showFlash, clearFlash } from '../lib/flash.svelte.js';
    import Field from './Field.svelte';
    
    // The shared state for this editing session; every component below can reach it.
    const editor = setEditor(new EditorState());

    let loading = $state(true); // waiting for the content
    let loadError = $state(''); // message if loading failed
    let publishing = $state(false); // a publish is in progress (disables the buttons)

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

    async function revealFirstError() {
        await tick(); // wait for Svelte to draw the red fields
        const field = document.querySelector('[data-invalid="true"]');
        if (!field) return;
        for (let el = field.closest('details'); el; el = el.parentElement?.closest('details') ?? null) el.open = true;
        await tick();
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field.querySelector('input, textarea, button')?.focus({ preventScroll: true });
    }

    async function publish() {
        clearFlash();

        // 1. Check everything in the browser first, for instant feedback.
        if (!editor.validate()) {
            showFlash('error', 'Hay campos por completar. Los tienes marcados en rojo.');
            revealFirstError();
            return;
        }

        publishing = true;
        try {
            // 2. Send the content and new images; the server makes the commit.
            const result = await api.publish(editor.publishForm());
            // 3. Reload from the server: `sha` is now the new commit, ready for the next
            // publish.
            editor.load(await api.site());
            showFlash(
                'success',
                result.changed ? '¡Publicado! Tu web se actualizará en uno o dos minutos.' : 'No había cambios que publicar.',
            );
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            // 4. Something failed. Edits stay in the editor in every case; pick the message.
            const error = e instanceof ApiError ? e : new ApiError(0, {});
            if (error.status === 409) {
                // Conflict: the site changed since she opened the editor (another tab, or you pushed).
                showFlash(
                    'warning',
                    'La web ha cambiado desde que abriste el editor. Recarga para ver la versión más reciente (tus cambios sin publicar se perderán).',
                    {
                        label: 'Recargar',
                        run: () => {
                            clearFlash();
                            load();
                        },
                    },
                );
            } else if (error.status === 422 && Array.isArray(error.body.issues)) {
                // The server found invalid fields: mark them in red like the browser check does.
                const errors = {};
                for (const issue of error.body.issues) errors[pathKey([issue.section, ...issue.path])] = issue.message;
                editor.errors = errors;
                showFlash('error', 'Hay campos por completar. Los tienes marcados en rojo.');
                revealFirstError();
            } else if (error.status === 401) {
                // Session expired: App.svelte shows the login screen.
            } else if (error.status === 0) {
                showFlash('error', 'No hay conexión. Tus cambios siguen aquí; vuelve a pulsar Publicar cuando tengas internet.');
            } else {
                showFlash(
                    'error',
                    error.body?.message && error.status === 422
                        ? error.body.message // e.g. "Ese archivo no es una imagen válida."
                        : 'Algo ha fallado al publicar. Tus cambios siguen aquí; prueba otra vez en un momento.',
                );
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        publishing = false;
    }
    
    // onMount runs once, when the editor first appears.
    onMount(() => {
        load();
        // Ask "leave this page?" if she closes the tab with unpublished changes.
        const beforeUnload = (event) => {
            if (editor.dirty) event.preventDefault();
        };
        window.addEventListener('beforeunload', beforeUnload);
        // The function returned here runs when the editor disappears: tidy up.
        return () => window.removeEventListener('beforeunload', beforeUnload);
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

        <!-- novalidate: the browser's own error bubbles are off; validate() shows ours. -->
        <form
          class="flex flex-col gap-8"
          onsubmit={(e) => {
            e.preventDefault(); // don't reload the page; publish() handles it
            publish();
            }
          }
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
                <div class="sticky bottom-0 z-10 -mx-4 px-4 py-3 flex items-center justify-end gap-2 sm:gap-3 bg-base-200/95 backdrop-blur border-t border-base-300">
                {#if editor.dirty}
                    <span class="badge badge-warning badge-soft mr-auto whitespace-nowrap"><span class="hidden sm:inline">Tienes cambios sin publicar</span><span class="sm:hidden">Sin publicar</span></span>
                {/if}
                <!-- On phones the label shortens to "Descartar" so the bar fits on one line. -->
                <button type="button" class="btn btn-ghost" onclick={discard} disabled={!editor.dirty || publishing}><span>Descartar<span class="hidden sm:inline">&nbsp;cambios</span></span></button>
                {#if editor.config.site.url}
                    <a href={editor.config.site.url} target="_blank" rel="noopener" class="btn btn-outline hidden sm:inline-flex">Ver la web</a>
                {/if}
                <button type="submit" class="btn btn-primary" disabled={!editor.dirty || publishing}>
                    {#if publishing}<span class="loading loading-spinner loading-sm"></span> Publicando…{:else}Publicar{/if}
                </button>
            </div>
        </form>
    {/if}
</div>
