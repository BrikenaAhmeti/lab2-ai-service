import { createApp } from './app';
import { env } from './config/env';
import { connectMongo } from './infrastructure/mongodb/mongoose';

async function bootstrap() {
    await connectMongo();

    const app = createApp();

    app.listen(env.port, () => {
        console.log(`MedSphere AI Service running on port ${env.port}`);
    });
}

void bootstrap().catch((error) => {
    console.error('Failed to start MedSphere AI Service', error);
    process.exit(1);
});
