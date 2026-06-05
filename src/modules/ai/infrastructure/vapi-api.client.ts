import { env } from '../../../config/env';
import { AppError } from '../../../shared/core/errors/app-error';

export interface VapiApiClient {
    listCalls(): Promise<unknown[]>;
    getCall(callId: string): Promise<unknown>;
    fetchArtifact(url: string): Promise<{ contentType: string; body: unknown }>;
}

export class HttpVapiApiClient implements VapiApiClient {
    constructor(
        private readonly baseUrl = env.vapiApiBaseUrl,
        private readonly token = env.vapiPrivateKey,
    ) {}

    async listCalls() {
        const response = await this.request('/call');
        const body = await response.json() as unknown;

        if (Array.isArray(body)) {
            return body;
        }

        if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
            return (body as { data: unknown[] }).data;
        }

        return [];
    }

    async getCall(callId: string) {
        const response = await this.request(`/call/${encodeURIComponent(callId)}`);

        return response.json() as Promise<unknown>;
    }

    async fetchArtifact(url: string) {
        const parsedUrl = new URL(url);

        if (parsedUrl.protocol !== 'https:') {
            throw new AppError('Unsupported Vapi artifact URL', 400);
        }

        const response = await fetch(parsedUrl);

        if (!response.ok) {
            throw new AppError('Vapi artifact could not be fetched', response.status);
        }

        const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
        const body = contentType.includes('application/json')
            ? await response.json()
            : await response.text();

        return { contentType, body };
    }

    private async request(path: string) {
        if (!this.token) {
            throw new AppError('Vapi private key is not configured', 503);
        }

        const response = await fetch(new URL(path, this.baseUrl), {
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
        });

        if (!response.ok) {
            throw new AppError('Vapi API request failed', response.status);
        }

        return response;
    }
}
