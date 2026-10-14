<script>
    import { api, ApiError } from '../lib/api.js';
    import { clearFlash } from '../lib/flash.svelte.js';

    let { onLogin } = $props();
    
    // The form's values, connected to the inputs with bind:value / bind:checked.
    let email = $state('');
    let password = $state('');
    let remember = $state(true);
    let error = $state('');
    let busy = $state(false); // waiting for the server (disables the button)
    
    async function submit(event) {
        event.preventDefault(); // handle it here instead of the browser reloading the page
        error = '';
        busy = true;
        try {
            const user = await api.login(email, password, remember);
            clearFlash();
            onLogin(user);
        } catch (e) {
            // Pick the message from the status code. The server never says whether it was the
            // email or the password that was wrong, and neither do we.
            const status = e instanceof ApiError ? e.status : 0;
            error =
                status === 429
                    ? 'Demasiados intentos. Espera 15 minutos y vuelve a probar.'
                    : status === 0
                        ? 'No hay conexión. Comprueba tu internet y vuelve a probar.'
                        : 'El correo o la contraseña no son correctos.';
            password = '';
        }
        busy = false;
    }
</script>

<div class="hero min-h-[calc(100vh-16rem)]">
    <div class="hero-content w-full max-w-md">
        <div class="card w-full bg-base-100 shadow-sm">
            <div class="card-body">
                <div class="text-center">
                    <h1 class="text-3xl font-bold">Hola de nuevo</h1>
                    <p class="text-base-content/60 mt-1">Entra para editar tu web</p>
                </div>

                <form class="flex flex-col gap-4 mt-6" onsubmit={submit}>
                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Correo electrónico</legend>
                        <!-- autocomplete="username" / "current-password" let the browser offer to save the password. -->
                        <!-- svelte-ignore a11y_autofocus -->
                        <input
                            type="email"
                            name="email"
                            autocomplete="username"
                            placeholder="nombre@ejemplo.com"
                            class="input w-full"
                            class:input-error={error}
                            bind:value={email}
                            required
                            autofocus
                        />
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Contraseña</legend>
                        <input
                            type="password"
                            name="password"
                            autocomplete="current-password"
                            placeholder="••••••••"
                            class="input w-full"
                            class:input-error={error}
                            bind:value={password}
                            required
                        />
                        {#if error}
                            <p class="text-error text-sm mt-1" role="alert">{error}</p>
                        {/if}
                    </fieldset>

                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="remember" class="checkbox checkbox-sm" bind:checked={remember} />
                        <span>Recordarme en este dispositivo</span>
                    </label>
                    
                    <button type="submit" class="btn btn-primary mt-2" disabled={busy}>
                        {#if busy}<span class="loading loading-spinner loading-sm"></span>{/if}
                        Entrar
                    </button>
                </form>
            </div>
        </div>
    </div>
</div>
