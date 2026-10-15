export class GitHubError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export class GitHub {
    constructor(env, repo) {
        this.env = env;
        this.repo = repo;
    }

    async request(path, init = {}, accept = 'application/vnd.github+json') {
        const response = await fetch(`${this.env.GITHUB_API}/repos/${this.repo}${path}`, {
            ...init,
            headers: {
                Accept: accept,
                Authorization: `Bearer ${this.env.GITHUB_TOKEN}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'imprenta',
                ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            },
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new GitHubError(
                response.status,
                `GitHub ${init.method ?? 'GET'} ${path} → ${response.status} ${text.slice(0, 300)}`,
            );
        }
        return response;
    }

    async json(path, init) {
        return (await this.request(path, init)).json();
    }

    async headSha(branch) {
        const ref = await this.json(`/git/ref/heads/${encodeURIComponent(branch)}`);
        return ref.object.sha;
    }

    async file(path, ref) {
        try {
            return await this.request(`/contents/${encodePath(path)}?ref=${ref}`, {}, 'application/vnd.github.raw+json');
        } catch (error) {
            if (error instanceof GitHubError && error.status === 404) return null;
            throw error;
        }
    }

    async text(path, ref) {
        const response = await this.file(path, ref);
        return response ? response.text() : null;
    }

    async createBlob(bytes) {
        const blob = await this.json('/git/blobs', {
            method: 'POST',
            body: JSON.stringify({ content: base64(bytes), encoding: 'base64' }),
        });
        return blob.sha;
    }

    async commit({ branch, parentSha, message, author, changes }) {
        // 1. Find the tree (folder listing) of the current commit.
        const parent = await this.json(`/git/commits/${parentSha}`);

        // 2. Make a new tree: the same as the parent's ("base_tree"), except for our changes.
        const tree = await this.json('/git/trees', {
            method: 'POST',
            body: JSON.stringify({
                base_tree: parent.tree.sha,
                tree: changes.map((change) => ({
                    path: change.path,
                    mode: '100644', // a normal (non-executable) file
                    type: 'blob',
                    ...(change.content !== undefined ? { content: change.content } : { sha: change.sha ?? null }),
                })),
            }),
        });

        // 3. Make a commit pointing at the new tree, with the current commit as its parent.
        const commit = await this.json('/git/commits', {
            method: 'POST',
            body: JSON.stringify({
                message,
                tree: tree.sha,
                parents: [parentSha],
                author: { ...author, date: new Date().toISOString() },
            }),
        });

        // 4. Move the branch to the new commit. Until this line runs, nothing has visibly
        // changed. force: false makes GitHub refuse if someone else pushed in the meantime,
        // instead of silently throwing their work away.
        await this.request(`/git/refs/heads/${encodeURIComponent(branch)}`, {
            method: 'PATCH',
            body: JSON.stringify({ sha: commit.sha, force: false }),
        });
        return commit.sha;
    }
}

function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}

function base64(bytes) {
    const arr = new Uint8Array(bytes);
    let s = '';  for (let i = 0; i < arr.length; i += 0x8000) {
        s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
    }
    return btoa(s);
}
