import { Schema, model, models, InferSchemaType } from 'mongoose';

const consultationSummarySchema = new Schema(
    {
        chiefComplaint: { type: String, default: '' },
        historyOfPresentIllness: { type: String, default: '' },
        examinationFindings: { type: String, default: '' },
        assessmentAndDiagnosis: { type: String, default: '' },
        treatmentPlan: { type: String, default: '' },
        followUpInstructions: { type: String, default: '' },
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

const aiConversationSchema = new Schema(
    {
        appointmentId: { type: String, required: true, index: true, unique: true },
        patientId: { type: String, index: true },
        staffId: { type: String, index: true },
        audioFileUrl: String,
        audioOriginalName: String,
        audioMimeType: String,
        audioSizeBytes: Number,
        transcription: String,
        summary: consultationSummarySchema,
        reportText: String,
        summaryStatus: {
            type: String,
            enum: ['draft', 'approved', 'discarded'],
            default: 'draft',
            index: true,
        },
        keywords: [{ type: String }],
        models: {
            transcription: String,
            summary: String,
        },
        tokenUsage: tokenUsageSchema,
        approvedAt: Date,
    },
    {
        collection: 'ai_conversations',
        timestamps: true,
    },
);

export type AiConversationDocument = InferSchemaType<typeof aiConversationSchema>;

export const AiConversationModel =
    models.AiConversation ||
    model('AiConversation', aiConversationSchema);
