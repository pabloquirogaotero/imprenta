export class ApiError extends Error {
    constructor(status, body) {
        super(body?.message ?? body?.error ?? `HTTP ${status}`);
        this.status = status;
        this.body = body; // the JSON the server sent, e.g. { error: 'invalid', issues: [...] }  
    }
}

let onUnauthenticated = () => {};
export function setUnauthenticatedHandler(handler) {
    onUnauthenticated = handler;
}

async function request(path, init = {}) {
    let response;
    try {
        response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init });
    } catch {
        // fetch() only throws when there's no response at all: no internet, server down...
        throw new ApiError(0, { error: 'offline' });
    }
    const body = await response.json().catch(() => ({}));
    // A 401 on the login form just means "wrong password", not "session expired".
    if (response.status === 401 && path !== '/login') onUnauthenticated();
    if (!response.ok) throw new ApiError(response.status, body);
    return body;
}

const json = (body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

export const api = {
    me: () => request('/me'),
    login: (email, password, remember) => request('/login', json({ email, password, remember })),
    logout: () => request('/logout', json({})),
    site: () => request('/site'),
    // A FormData body (text + files); the browser sets the right Content-Type itself.
    publish: (form) => request('/publish', { method: 'POST', body: form }),
};

export function imageUrl(path, sha) {
    return `/api/image?path=${encodeURIComponent(path)}&ref=${sha}`;
}
