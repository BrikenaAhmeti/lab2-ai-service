import { Schema, model, models, InferSchemaType } from 'mongoose';

const messageSchema = new Schema(
    {
        role: {
            type: String,
            enum: ['user', 'assistant'],
            required: true,
        },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
    },
    { _id: false },
);

const tokenUsageSchema = new Schema(
    {
        promptTokens: Number,
        completionTokens: Number,
        totalTokens: Number,
    },
    { _id: false },
);

const logSchema = new Schema(
    {
        event: {
            type: String,
            enum: [
                'session_started',
                'message_received',
                'typing_started',
                'message_answered',
                'error',
            ],
            required: true,
        },
        message: String,
        timestamp: { type: Date, default: Date.now },
    },
    { _id: false },
);

const aiDashboardHelperSessionSchema = new Schema(
    {
        sessionId: { type: String, required: true, unique: true, index: true },
        userId: { type: String, required: true, index: true },
        patientId: { type: String, index: true },
        role: { type: String, required: true, index: true },
        portalTitle: String,
        permissions: [{ type: String }],
        messages: [messageSchema],
        logs: [logSchema],
        model: String,
        tokenUsage: tokenUsageSchema,
        lastMessageAt: { type: Date, index: true },
    },
    {
        collection: 'ai_dashboard_helper_sessions',
        timestamps: true,
    },
);

export type AiDashboardHelperSessionDocument = InferSchemaType<
    typeof aiDashboardHelperSessionSchema
>;

export const AiDashboardHelperSessionModel =
    models.AiDashboardHelperSession ||
    model('AiDashboardHelperSession', aiDashboardHelperSessionSchema);
