import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { connectMongo } from './infrastructure/mongodb/mongoose';
import { createSocketServer } from './socket/socket-server';

async function bootstrap() {
    await connectMongo();

    const app = createApp();
    const httpServer = createServer(app);

    createSocketServer(httpServer);

    httpServer.listen(env.port, () => {
        console.log(`MedSphere AI Service running on port ${env.port}`);
    });
}

void bootstrap().catch((error) => {
    console.error('Failed to start MedSphere AI Service', error);
    process.exit(1);
});
