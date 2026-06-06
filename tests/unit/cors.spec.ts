describe('AI CORS policy', () => {
    const originalEnv = process.env;

    async function loadCors(overrides: NodeJS.ProcessEnv) {
        jest.resetModules();
        process.env = {
            ...originalEnv,
            NODE_ENV: 'production',
            CORS_ORIGIN: 'https://app.example.com',
            ...overrides,
        };

        return import('../../src/config/cors');
    }

    afterEach(() => {
        process.env = originalEnv;
        jest.resetModules();
    });

    it('allows configured production origins', async () => {
        const { isCorsOriginAllowed } = await loadCors({});

        expect(isCorsOriginAllowed('https://app.example.com')).toBe(true);
    });

    it('does not allow wildcard origins in production', async () => {
        const { isCorsOriginAllowed } = await loadCors({ CORS_ORIGIN: '*' });

        expect(isCorsOriginAllowed('https://evil.example.com')).toBe(false);
    });
});
