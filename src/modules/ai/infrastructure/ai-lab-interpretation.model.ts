import { Schema, model, models, InferSchemaType } from 'mongoose';

const riskFlagSchema = new Schema(
    {
        testName: { type: String, required: true },
        severity: {
            type: String,
            enum: ['low', 'moderate', 'high', 'critical'],
            required: true,
        },
        value: String,
        note: { type: String, required: true },
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

const aiLabInterpretationSchema = new Schema(
    {
        labOrderId: { type: String, required: true, index: true, unique: true },
        patientId: { type: String, index: true },
        clinicalInterpretation: { type: String, required: true },
        patientInterpretation: { type: String, required: true },
        disclaimer: {
            type: String,
            required: true,
            default: 'AI-generated explanation — discuss results with your doctor.',
        },
        riskFlags: [riskFlagSchema],
        recommendations: [{ type: String }],
        model: { type: String, required: true },
        tokenUsage: tokenUsageSchema,
    },
    {
        collection: 'ai_lab_interpretations',
        timestamps: true,
    },
);

export type AiLabInterpretationDocument = InferSchemaType<
    typeof aiLabInterpretationSchema
>;

export const AiLabInterpretationModel =
    models.AiLabInterpretation ||
    model('AiLabInterpretation', aiLabInterpretationSchema);
