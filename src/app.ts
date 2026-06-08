import express from 'express';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './shared/middleware/error-handler';
import { notFoundHandler } from './shared/middleware/not-found';
import { aiRoutes } from './modules/ai/presentation/ai.routes';
import { getMongoHealth } from './infrastructure/mongodb/mongoose';
import { registerSwaggerDocs } from './docs/swagger';
import { env } from './config/env';
import { corsOptions } from './config/cors';
import { createRateLimiter } from './shared/middleware/rate-limit';

export function createApp() {
    const app = express();

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", 'data:'],
                    fontSrc: ["'self'", 'data:'],
                },
            },
        }),
    );
    app.use(cors(corsOptions));
    app.use(createRateLimiter({
        windowMs: 15 * 60_000,
        maxRequests: 400,
        skip: (req) => req.method === 'OPTIONS' || req.path === '/health',
    }));
    app.use(morgan('dev'));
    app.use(express.json());
    app.use(
        '/uploads',
        express.static(env.uploadsDir, {
            setHeaders(res, filePath) {
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

                if (
                    path.extname(filePath).toLowerCase() === '.webm' &&
                    filePath.includes('consultation-audio')
                ) {
                    res.setHeader('Content-Type', 'audio/webm');
                }
            },
        }),
    );

    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            service: 'medsphere-ai-service',
            mongo: getMongoHealth(),
        });
    });

    registerSwaggerDocs(app);

    app.use('/api/ai', aiRoutes);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}
