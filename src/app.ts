import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './shared/middleware/error-handler';
import { notFoundHandler } from './shared/middleware/not-found';
import { aiRoutes } from './modules/ai/presentation/ai.routes';
import { getMongoHealth } from './infrastructure/mongodb/mongoose';
import { registerSwaggerDocs } from './docs/swagger';
import { env } from './config/env';

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
    app.use(
        cors({
            origin: parseCorsOrigin(env.corsOrigin),
            credentials: true,
        }),
    );
    app.use(morgan('dev'));
    app.use(express.json());
    app.use('/uploads', express.static(env.uploadsDir));

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

function parseCorsOrigin(origin: string) {
    if (origin === '*') {
        return true;
    }

    if (origin.includes(',')) {
        return origin
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return origin;
}
