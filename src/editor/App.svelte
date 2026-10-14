<script>
    import { onMount } from 'svelte';
    import { api, setUnauthenticatedHandler } from './lib/api.js'; 
    import { flash, clearFlash, showFlash } from './lib/flash.svelte.js';
    import Login from './components/Login.svelte';
    import Editor from './components/Editor.svelte';

    let me = $state(null); // the signed-in user { name, email }, or null
    let checking = $state(true); // still asking the server who we are
    let menu = $state(); // the user dropdown (to close it after clicking "Cerrar sesión")

    // If any request later answers 401 (the session expired, e.g. after 12 hours),
    // go back to the login form and say why.
    setUnauthenticatedHandler(() => {
        if (me) showFlash('warning', 'Tu sesión ha caducado. Vuelve a entrar para seguir.');
        me = null;
    });

    onMount(async () => {
        try {
            me = await api.me();
        } catch {
            me = null; // not signed in (or offline): show the login form
        }
        checking = false;
    });

    async function logout() {
        if (menu) menu.open = false;
        await api.logout().catch(() => {});
        me = null;
        showFlash('success', 'Has cerrado la sesión.');
    }

    // The letter in the round avatar: the first letter of the user's name.
    const initial = $derived(me?.name.trim().charAt(0).toUpperCase() ?? '');
    const year = new Date().getFullYear();
</script>

<div class="min-h-screen flex flex-col bg-base-200">
    <header class="navbar bg-base-100 border-b border-base-300 px-4 sm:px-6">
        <div class="navbar-start">
            <span class="text-2xl font-bold tracking-tight">Imprenta</span>
        </div>
        <div class="navbar-end">
            {#if me}
                <!-- "Hola, <name>" + avatar; a <details> element opens and closes the menu without any JavaScript. -->
                <details class="dropdown dropdown-end" bind:this={menu}>
                    <summary class="btn btn-ghost gap-2 px-2 list-none [&::-webkit-details-marker]:hidden">
                        <span class="text-sm font-medium hidden sm:inline">Hola, {me.name}</span>
                        <div class="avatar avatar-placeholder">
                            <div class="size-10 rounded-full ring ring-base-300 bg-neutral text-neutral-content">
                                <span class="text-base">{initial}</span>
                            </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" class="size-4 text-base-content/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </summary>
                    <ul class="menu dropdown-content bg-base-100 rounded-box z-20 mt-3 w-44 p-2 shadow-md border border-base-300">
                        <li><button type="button" onclick={logout}>Cerrar sesión</button></li>
                    </ul>
                </details>
            {/if}
        </div>
    </header>

    <main class="flex-1">
        <!-- The banner (see lib/flash.svelte.js): green, red or yellow, with an optional button. -->
        {#if flash.kind}
            <div
              role="status"
              class="alert rounded-none justify-center"
              class:alert-success={flash.kind === 'success'}
              class:alert-error={flash.kind === 'error'}
              class:alert-warning={flash.kind === 'warning'}
            >
                <span>{flash.message}</span>
                {#if flash.action}
                    <button type="button" class="btn btn-sm" onclick={flash.action.run}>
                        {flash.action.label}
                    </button>
                {/if}
                <button type="button" class="btn btn-ghost btn-xs btn-square" aria-label="Cerrar aviso" onclick={clearFlash}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                </button>
            </div>
        {/if}
        {#if checking}
            <div class="flex justify-center py-24">
                <span class="loading loading-spinner loading-lg"></span>
            </div>
        {:else if me}
            <Editor />
        {:else}
            <Login onLogin={(user) => (me = user)} />
        {/if}
    </main>

    <footer class="footer sm:footer-horizontal footer-center bg-base-100 text-base-content p-4">
        <aside>
            <p>&copy; {year} · Imprenta</p>
        </aside>
    </footer>
</div>
