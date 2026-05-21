import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './shared/middleware/error-handler';
import { notFoundHandler } from './shared/middleware/not-found';
import { aiRoutes } from './modules/ai/presentation/ai.routes';
import { getMongoHealth } from './infrastructure/mongodb/mongoose';

export function createApp() {
    const app = express();

    app.use(helmet());
    app.use(cors());
    app.use(morgan('dev'));
    app.use(express.json());

    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            service: 'medsphere-ai-service',
            mongo: getMongoHealth(),
        });
    });

    app.use('/api/ai', aiRoutes);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}
