import { AppError } from '../../../shared/core/errors/app-error';
import {
    AiProvider,
    SummarizeConsultationInput,
} from '../../../infrastructure/ai/ai-provider';
import { ConsultationSummary, UploadedAudio } from '../domain/ai.types';
import { AiConversationModel } from '../infrastructure/ai-conversation.model';

interface TranscribeConsultationInput {
    file: UploadedAudio;
    appointmentId?: string;
    patientId?: string;
    staffId?: string;
    audioFileUrl?: string;
    audioOriginalName?: string;
    audioMimeType?: string;
    audioSizeBytes?: number;
}

interface SummarizeAndStoreInput extends SummarizeConsultationInput {
    appointmentId: string;
    patientId?: string;
    staffId?: string;
}

interface UpdateConsultationSummaryInput {
    appointmentId: string;
    reportText?: string;
    summary?: ConsultationSummary;
    summaryStatus?: 'draft' | 'approved' | 'discarded';
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
                    audioOriginalName: input.audioOriginalName,
                    audioMimeType: input.audioMimeType,
                    audioSizeBytes: input.audioSizeBytes,
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
        const reportText = formatConsultationReport(result.summary);

        const conversation = await AiConversationModel.findOneAndUpdate(
            { appointmentId: input.appointmentId },
            {
                $set: {
                    appointmentId: input.appointmentId,
                    patientId: input.patientId,
                    staffId: input.staffId,
                    transcription: input.transcription,
                    summary: result.summary,
                    reportText,
                    summaryStatus: 'draft',
                    'models.summary': result.model,
                    tokenUsage: result.tokenUsage,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();

        return {
            summary: result.summary,
            reportText,
            conversation,
        };
    }

    async updateSummary(input: UpdateConsultationSummaryInput) {
        const setValues: Record<string, unknown> = {};

        if (input.reportText !== undefined) {
            setValues.reportText = input.reportText;
        }

        if (input.summary !== undefined) {
            setValues.summary = input.summary;
        }

        if (input.summaryStatus !== undefined) {
            setValues.summaryStatus = input.summaryStatus;
            setValues.approvedAt =
                input.summaryStatus === 'approved' ? new Date() : null;
        }

        if (Object.keys(setValues).length === 0) {
            throw new AppError('At least one summary field is required', 400);
        }

        const conversation = await AiConversationModel.findOneAndUpdate(
            { appointmentId: input.appointmentId },
            { $set: setValues },
            { new: true },
        ).lean();

        if (!conversation) {
            throw new AppError('AI consultation conversation not found', 404);
        }

        return conversation;
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

function formatConsultationReport(summary: ConsultationSummary) {
    const sections: Array<[string, string]> = [
        ['Chief complaint', summary.chiefComplaint],
        ['History of present illness', summary.historyOfPresentIllness],
        ['Examination findings', summary.examinationFindings],
        ['Assessment and diagnosis', summary.assessmentAndDiagnosis],
        ['Treatment plan', summary.treatmentPlan],
        ['Follow-up instructions', summary.followUpInstructions],
    ];

    return sections
        .map(([heading, value]) => `${heading}\n${value?.trim() || '-'}`)
        .join('\n\n');
}
