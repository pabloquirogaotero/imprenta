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
}

function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}
