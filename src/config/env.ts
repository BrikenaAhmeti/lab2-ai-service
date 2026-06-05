import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3010),
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),
    CORS_ORIGIN: z.string().min(1).default('*'),
    MONGODB_URI: z
        .string()
        .min(1)
        .default('mongodb://localhost:27017/medsphere_ai'),
    AI_PROVIDER_MODE: z.enum(['stub', 'openai']).default('stub'),
    OPENAI_API_KEY: z.string().optional().default(''),
    OPENAI_TEXT_MODEL: z.string().min(1).default('gpt-4o'),
    OPENAI_TRANSCRIPTION_MODEL: z.string().min(1).default('whisper-1'),
    AUTH_SERVICE_URL: z.string().url().default('http://localhost:3005'),
    CORE_SERVICE_URL: z.string().url().default('http://localhost:3007'),
    INTERNAL_API_KEY: z.string().optional().default(''),
    JWT_ACCESS_SECRET: z.string().optional().default(''),
    DASHBOARD_HELPER_KB_PATH: z
        .string()
        .min(1)
        .default(path.join(process.cwd(), 'docs', 'medsphere-role-portal-user-friendly-knowledge-base.txt')),
    MAX_AUDIO_FILE_SIZE_MB: z.coerce.number().positive().default(25),
    UPLOADS_DIR: z
        .string()
        .min(1)
        .default(path.join(process.cwd(), 'uploads')),
    PUBLIC_BASE_URL: z.union([z.string().url(), z.literal('')]).default(''),
    VAPI_API_BASE_URL: z.string().url().default('https://api.vapi.ai'),
    VAPI_PRIVATE_KEY: z.string().optional().default(''),
    VAPI_ASSISTANT_ID: z.string().optional().default(''),
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
    corsOrigin: values.CORS_ORIGIN,
    mongoUri: values.MONGODB_URI,
    aiProviderMode: values.AI_PROVIDER_MODE,
    openAiApiKey: values.OPENAI_API_KEY,
    openAiTextModel: values.OPENAI_TEXT_MODEL,
    openAiTranscriptionModel: values.OPENAI_TRANSCRIPTION_MODEL,
    authServiceUrl: values.AUTH_SERVICE_URL,
    coreServiceUrl: values.CORE_SERVICE_URL,
    internalApiKey: values.INTERNAL_API_KEY,
    jwtAccessSecret: values.JWT_ACCESS_SECRET,
    dashboardHelperKnowledgeBasePath: values.DASHBOARD_HELPER_KB_PATH,
    maxAudioFileSizeMb: values.MAX_AUDIO_FILE_SIZE_MB,
    uploadsDir: values.UPLOADS_DIR,
    publicBaseUrl: values.PUBLIC_BASE_URL,
    vapiApiBaseUrl: values.VAPI_API_BASE_URL,
    vapiPrivateKey: values.VAPI_PRIVATE_KEY,
    vapiAssistantId: values.VAPI_ASSISTANT_ID,
};
