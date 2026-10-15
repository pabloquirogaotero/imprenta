<script>
    import { labelFor } from '../../shared/schema.js';
    import { getEditor, pathKey } from '../lib/editor.svelte.js';
    import { prepareImage } from '../lib/images.js';

    let { field, record, path } = $props();

    const editor = getEditor();
    const error = $derived(editor.errors[pathKey(path)]);
    const src = $derived(editor.imageSrc(record[field.name])); // what the thumbnail shows

    let input = $state(); // the hidden file input
    let dragging = $state(false); // a file is being dragged over the field
    let working = $state(false); // shrinking the picked photo
    let problem = $state(''); // message if the file couldn't be used

    async function use(file) {
        if (!file) return;
        problem = '';
        working = true;
        try {
            record[field.name] = editor.addImage(await prepareImage(file));
            editor.clearError(path);
        } catch {
            problem = 'No se ha podido usar ese archivo. Prueba con una foto en formato JPG o PNG.';
        }
        working = false;
        if (input) input.value = ''; // so picking the same file again still triggers onchange
    }
    
    function drop(event) {
        event.preventDefault(); // stop the browser from opening the dropped file
        dragging = false;
        use(event.dataTransfer?.files?.[0]);
    }
    
    function dragover(event) {
        // Only react to files from the computer, not to cards being reordered on the page.
        if (!event.dataTransfer?.types.includes('Files')) return;
        event.preventDefault(); // allows the drop
        dragging = true;
    }
</script>

<fieldset class="fieldset" data-invalid={error ? 'true' : undefined}>
    <legend class="fieldset-legend">
        {labelFor(field)}
        {#if !field.required}<span class="font-normal text-base-content/50">(opcional)</span>{/if}
    </legend>
    <!-- The whole row is the drop zone; it gets a dashed outline while a file is over it. -->
    <div
      class={[
        'flex items-center gap-4 rounded-lg p-1 -m-1 transition-colors',
        dragging && 'bg-primary/10 outline-2 outline-dashed outline-primary',
      ]}
      role="group"
      ondragover={dragover}
      ondragleave={() => (dragging = false)}
      ondrop={drop}
    >
        {#if src}
            <img {src} alt="" class="w-32 h-24 rounded-lg object-cover bg-base-200 shrink-0" class:ring-2={error} class:ring-error={error} />
        {:else}
            <div class="w-32 h-24 rounded-lg bg-base-200 flex items-center justify-center text-base-content/40 text-sm shrink-0" class:ring-2={error} class:ring-error={error}>
                Sin imagen
            </div>
        {/if}
        <div class="flex flex-col items-start gap-1">
            <!-- A <label> styled as a button; clicking it opens the (hidden) file picker inside it. -->
            <label class="btn btn-sm btn-outline" class:btn-disabled={working}>
                {#if working}
                    <span class="loading loading-spinner loading-xs"></span> Preparando…
                {:else}
                    {src ? 'Cambiar imagen' : 'Elegir imagen'}
                {/if}
                <input
                  bind:this={input}
                  type="file"
                  accept="image/*"
                  class="sr-only"
                  disabled={working}
                  onchange={(e) => use(e.currentTarget.files?.[0])}
                  />
            </label>
            <span class="text-xs text-base-content/50 hidden sm:block">o arrastra una foto aquí</span>
            {#if src && !field.required}
                <button type="button" class="btn btn-ghost btn-xs" onclick={() => (record[field.name] = '')}>Quitar imagen</button>
            {/if}
        </div>
    </div>
    {#if error || problem}
        <p class="text-error text-sm">{problem || error}</p>
    {:else if field.help}
        <p class="label whitespace-normal">{field.help}</p>
    {/if}
</fieldset>
