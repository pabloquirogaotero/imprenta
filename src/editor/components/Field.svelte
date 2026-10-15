<script>
    import { labelFor } from '../../shared/schema.js';
    import { pathKey } from '../lib/editor.svelte.js';
    import Collection from './Collection.svelte';
    import ImageField from './ImageField.svelte';

    // $props() receives what the parent passed in.
    let { field, record, path } = $props();
    
    // $derived values recalculate automatically when what they use changes.
    const fieldPath = $derived([...path, field.name]);
    // A unique HTML id, so clicking the label focuses the box.
    const id = $derived(`f-${pathKey(fieldPath).replace(/[^-0-9A-Za-z]/g, '-')}`);
</script>

{#if field.type === 'collection'}
    <Collection {field} items={record[field.name]} path={fieldPath} />
{:else if field.type === 'image'}
    <ImageField {field} {record} path={fieldPath} />
{:else}
    <fieldset class="fieldset">
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
              rows={field.type === 'longtext' ? 4 : 1}
              placeholder={field.placeholder}
              bind:value={record[field.name]}
            ></textarea>
        {:else}
            <!-- url or email: a one-line box. inputmode shows the right keyboard on phones. -->
            <input
              {id}
              type={field.type === 'email' ? 'email' : 'url'}
              inputmode={field.type === 'email' ? 'email' : 'url'}
              class="input w-full text-base"
              placeholder={field.placeholder}
              bind:value={record[field.name]}
            />
        {/if}
        
        <!-- Under the box: a short help text, if the config gives one. -->
        {#if field.help}
            <p class="label whitespace-normal">{field.help}</p>
        {/if}
    </fieldset>
{/if}
