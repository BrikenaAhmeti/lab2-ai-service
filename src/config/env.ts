import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3010),
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),
    MONGODB_URI: z
        .string()
        .min(1)
        .default('mongodb://localhost:27017/medsphere_ai'),
    AI_PROVIDER_MODE: z.enum(['stub', 'openai']).default('stub'),
    OPENAI_API_KEY: z.string().optional().default(''),
    OPENAI_TEXT_MODEL: z.string().min(1).default('gpt-4o'),
    OPENAI_TRANSCRIPTION_MODEL: z.string().min(1).default('whisper-1'),
    CORE_SERVICE_URL: z.string().url().default('http://localhost:3007'),
    INTERNAL_API_KEY: z.string().optional().default(''),
    MAX_AUDIO_FILE_SIZE_MB: z.coerce.number().positive().default(25),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    const message = parsedEnv.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');

    throw new Error(`Invalid environment configuration: ${message}`);
}

const values = parsedEnv.data;

export const env = {
    port: values.PORT,
    nodeEnv: values.NODE_ENV,
    mongoUri: values.MONGODB_URI,
    aiProviderMode: values.AI_PROVIDER_MODE,
    openAiApiKey: values.OPENAI_API_KEY,
    openAiTextModel: values.OPENAI_TEXT_MODEL,
    openAiTranscriptionModel: values.OPENAI_TRANSCRIPTION_MODEL,
    coreServiceUrl: values.CORE_SERVICE_URL,
    internalApiKey: values.INTERNAL_API_KEY,
    maxAudioFileSizeMb: values.MAX_AUDIO_FILE_SIZE_MB,
};
