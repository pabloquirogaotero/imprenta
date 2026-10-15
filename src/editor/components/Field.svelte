<script>
    import { labelFor } from '../../shared/schema.js';
    import { getEditor, pathKey } from '../lib/editor.svelte.js';
    import Collection from './Collection.svelte';
    import ImageField from './ImageField.svelte';

    // $props() receives what the parent passed in.
    let { field, record, path } = $props();
    
    const editor = getEditor();
    // $derived values recalculate automatically when what they use changes.
    const fieldPath = $derived([...path, field.name]);
    const error = $derived(editor.errors[pathKey(fieldPath)]); // this field's error message, if any
    // A unique HTML id, so clicking the label focuses the box.
    const id = $derived(`f-${pathKey(fieldPath).replace(/[^-0-9A-Za-z]/g, '-')}`);
</script>

{#if field.type === 'collection'}
    <Collection {field} items={record[field.name]} path={fieldPath} />
{:else if field.type === 'image'}
    <ImageField {field} {record} path={fieldPath} />
{:else}
    <!-- data-invalid lets Editor.svelte find the first field with an error and scroll to it. -->
     <fieldset class="fieldset" data-invalid={error ? 'true' : undefined}>
        <legend class="fieldset-legend">
            <label for={id}>{labelFor(field)}</label>
            {#if !field.required}<span class="font-normal text-base-content/50">(opcional)</span>{/if}
        </legend>
        {#if field.type === 'text' || field.type === 'longtext'}
            <!--
                bind:value connects the box to the content both ways: typing changes
                record[field.name], and changing record[field.name] changes the box.
                field-sizing-content makes the box grow with its text.
            -->
            <textarea
              {id}
              class="textarea w-full field-sizing-content text-base"
              class:min-h-32={field.type === 'longtext'}
              class:min-h-0={field.type === 'text'}
              class:textarea-error={error}
              rows={field.type === 'longtext' ? 4 : 1}
              placeholder={field.placeholder}
              bind:value={record[field.name]}
              oninput={() => editor.clearError(fieldPath)}
            ></textarea>
        {:else}
            <!-- url or email: a one-line box. inputmode shows the right keyboard on phones. -->
            <input
              {id}
              type={field.type === 'email' ? 'email' : 'url'}
              inputmode={field.type === 'email' ? 'email' : 'url'}
              class="input w-full text-base"
              class:input-error={error}
              placeholder={field.placeholder}
              bind:value={record[field.name]}
              oninput={() => editor.clearError(fieldPath)}
            />
        {/if}
        
        <!-- Under the box: the error in red if there is one, otherwise the help text. -->
        {#if error}
            <p class="text-error text-sm">{error}</p>
        {:else if field.help}
            <p class="label whitespace-normal">{field.help}</p>
        {/if}
    </fieldset>
{/if}
