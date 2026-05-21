import { Schema, model, models, InferSchemaType } from 'mongoose';

const messageSchema = new Schema(
    {
        role: {
            type: String,
            enum: ['system', 'user', 'assistant', 'tool'],
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

const aiReservationSessionSchema = new Schema(
    {
        sessionId: { type: String, required: true, unique: true, index: true },
        userId: { type: String, index: true },
        patientId: { type: String, index: true },
        messages: [messageSchema],
        suggestedDepartment: String,
        suggestedStaff: String,
        outcome: {
            type: String,
            enum: ['in_progress', 'booked', 'abandoned', 'referred'],
            default: 'in_progress',
            index: true,
        },
        appointmentId: String,
        model: String,
        tokenUsage: tokenUsageSchema,
    },
    {
        collection: 'ai_reservation_sessions',
        timestamps: true,
    },
);

export type AiReservationSessionDocument = InferSchemaType<
    typeof aiReservationSessionSchema
>;

export const AiReservationSessionModel =
    models.AiReservationSession ||
    model('AiReservationSession', aiReservationSessionSchema);
