import request from 'supertest';
import { createApp } from '../../src/app';

describe('AI service routes', () => {
    const app = createApp();

    it('returns AI service health', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            status: 'ok',
            service: 'medsphere-ai-service',
        });
    });

    it('describes the AI service capabilities from the sprint scope', async () => {
        const response = await request(app).get('/api/ai/capabilities');

        expect(response.status).toBe(200);
        expect(response.body.storage).toBe('mongodb');
        expect(response.body.features.map((feature: { id: string }) => feature.id)).toEqual([
            'MS-33',
            'MS-34',
            'MS-35',
        ]);
    });

    it('validates summarize requests before invoking persistence', async () => {
        const response = await request(app).post('/api/ai/summarize').send({});

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Validation failed');
    });
});
