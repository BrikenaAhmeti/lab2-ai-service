import mongoose from 'mongoose';
import { env } from '../../config/env';

export async function connectMongo() {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    await mongoose.connect(env.mongoUri, {
        autoIndex: env.nodeEnv !== 'production',
    });

    return mongoose.connection;
}

export async function disconnectMongo() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
}

export function getMongoHealth() {
    const states: Record<number, string> = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
    };

    return {
        status: states[mongoose.connection.readyState] ?? 'unknown',
        database: mongoose.connection.name || null,
    };
}
