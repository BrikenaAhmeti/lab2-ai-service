import { AppError } from '../../../shared/core/errors/app-error';
import {
    AiProvider,
    SummarizeConsultationInput,
} from '../../../infrastructure/ai/ai-provider';
import { UploadedAudio } from '../domain/ai.types';
import { AiConversationModel } from '../infrastructure/ai-conversation.model';

interface TranscribeConsultationInput {
    file: UploadedAudio;
    appointmentId?: string;
    patientId?: string;
    staffId?: string;
    audioFileUrl?: string;
}

interface SummarizeAndStoreInput extends SummarizeConsultationInput {
    appointmentId: string;
    patientId?: string;
    staffId?: string;
}

export class ConsultationAiService {
    constructor(private readonly provider: AiProvider) {}

    async transcribe(input: TranscribeConsultationInput) {
        const result = await this.provider.transcribeAudio(input.file);

        if (!input.appointmentId) {
            return result;
        }

        await AiConversationModel.findOneAndUpdate(
            { appointmentId: input.appointmentId },
            {
                $set: {
                    appointmentId: input.appointmentId,
                    patientId: input.patientId,
                    staffId: input.staffId,
                    audioFileUrl: input.audioFileUrl,
                    transcription: result.text,
                    'models.transcription': result.model,
                    tokenUsage: result.tokenUsage,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        return result;
    }

    async summarize(input: SummarizeAndStoreInput) {
        const result = await this.provider.summarizeConsultation(input);

        const conversation = await AiConversationModel.findOneAndUpdate(
            { appointmentId: input.appointmentId },
            {
                $set: {
                    appointmentId: input.appointmentId,
                    patientId: input.patientId,
                    staffId: input.staffId,
                    transcription: input.transcription,
                    summary: result.summary,
                    summaryStatus: 'draft',
                    'models.summary': result.model,
                    tokenUsage: result.tokenUsage,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();

        return {
            summary: result.summary,
            conversation,
        };
    }

    async getByAppointmentId(appointmentId: string) {
        const conversation = await AiConversationModel.findOne({
            appointmentId,
        }).lean();

        if (!conversation) {
            throw new AppError('AI consultation conversation not found', 404);
        }

        return conversation;
    }

    async approveSummary(appointmentId: string) {
        const conversation = await AiConversationModel.findOneAndUpdate(
            {
                appointmentId,
                summary: { $exists: true },
            },
            {
                $set: {
                    summaryStatus: 'approved',
                    approvedAt: new Date(),
                },
            },
            { new: true },
        ).lean();

        if (!conversation) {
            throw new AppError('AI consultation summary not found', 404);
        }

        return conversation;
    }
}
