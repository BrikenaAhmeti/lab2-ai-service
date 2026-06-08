import { AppError } from '../../../shared/core/errors/app-error';
import {
    AiProvider,
    SummarizeConsultationInput,
} from '../../../infrastructure/ai/ai-provider';
import {
    AppointmentClinicalContext,
    AppointmentClinicalContextClient,
    CoreAppointmentClinicalContextClient,
} from '../infrastructure/core-appointment-clinical-context.client';
import {
    ConsultationConversationTurn,
    ConsultationSummary,
    UploadedAudio,
} from '../domain/ai.types';
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
    summarize?: boolean;
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
    constructor(
        private readonly provider: AiProvider,
        private readonly clinicalContextClient: AppointmentClinicalContextClient =
            new CoreAppointmentClinicalContextClient(),
    ) {}

    async transcribe(input: TranscribeConsultationInput) {
        const transcription = await this.provider.transcribeAudio(input.file);
        const conversationTurns = await this.structureConversationSafely(
            transcription.text,
        );
        const transcriptionResult = {
            ...transcription,
            conversationTurns,
        };

        if (!input.appointmentId) {
            return transcriptionResult;
        }

        const baseSetValues = {
            appointmentId: input.appointmentId,
            patientId: input.patientId,
            staffId: input.staffId,
            audioFileUrl: input.audioFileUrl,
            audioOriginalName: input.audioOriginalName,
            audioMimeType: input.audioMimeType,
            audioSizeBytes: input.audioSizeBytes,
            transcription: transcription.text,
            conversationTurns,
            'models.transcription': transcription.model,
            tokenUsage: transcription.tokenUsage,
        };

        if (!input.summarize || !transcription.text.trim()) {
            await AiConversationModel.findOneAndUpdate(
                { appointmentId: input.appointmentId },
                { $set: baseSetValues },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );

            return transcriptionResult;
        }

        const clinicalContext = await this.clinicalContextClient.getByAppointmentId(
            input.appointmentId,
        );
        const summaryResult = await this.provider.summarizeConsultation({
            transcription: transcription.text,
            conversationTurns,
            context: buildSummaryContext(clinicalContext),
        });
        const reportText = formatConsultationReport(summaryResult.summary);
        const conversation = await AiConversationModel.findOneAndUpdate(
            { appointmentId: input.appointmentId },
            {
                $set: {
                    ...baseSetValues,
                    patientId: input.patientId,
                    summary: summaryResult.summary,
                    reportText,
                    summaryStatus: 'draft',
                    'models.summary': summaryResult.model,
                    tokenUsage: summaryResult.tokenUsage ?? transcription.tokenUsage,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();

        return {
            ...transcriptionResult,
            summary: summaryResult.summary,
            reportText,
            conversation,
        };
    }

    async summarize(input: SummarizeAndStoreInput) {
        const clinicalContext = await this.clinicalContextClient.getByAppointmentId(
            input.appointmentId,
        );
        const existingConversation = await AiConversationModel.findOne({
            appointmentId: input.appointmentId,
        }).lean();
        const conversationTurns =
            normalizeConversationTurns(existingConversation?.conversationTurns).length > 0
                ? normalizeConversationTurns(existingConversation?.conversationTurns)
                : await this.structureConversationSafely(input.transcription);
        const result = await this.provider.summarizeConsultation({
            transcription: input.transcription,
            conversationTurns,
            context: buildSummaryContext(clinicalContext),
        });
        const reportText = formatConsultationReport(result.summary);

        const conversation = await AiConversationModel.findOneAndUpdate(
            { appointmentId: input.appointmentId },
            {
                $set: {
                    appointmentId: input.appointmentId,
                    patientId: input.patientId,
                    staffId: input.staffId,
                    transcription: input.transcription,
                    conversationTurns,
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

    private async structureConversationSafely(
        transcription: string,
    ): Promise<ConsultationConversationTurn[]> {
        const trimmed = transcription.trim();

        if (!trimmed) {
            return [];
        }

        try {
            const turns = await this.provider.structureConsultationConversation({
                transcription: trimmed,
            });
            const normalizedTurns = normalizeConversationTurns(turns);

            if (normalizedTurns.length > 0) {
                return normalizedTurns;
            }
        } catch {
            return fallbackConversationTurns(trimmed);
        }

        return fallbackConversationTurns(trimmed);
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

function buildSummaryContext(clinicalContext: AppointmentClinicalContext | null) {
    if (!clinicalContext) {
        return undefined;
    }

    return {
        privacy: 'This context intentionally excludes patient name, email, phone, address, personal number, and emergency contacts.',
        appointment: clinicalContext.appointment,
        patientClinicalProfile: clinicalContext.patient,
        recentMedicalRecords: clinicalContext.recentMedicalRecords,
        recentPrescriptions: clinicalContext.recentPrescriptions,
    };
}

function formatConsultationReport(summary: ConsultationSummary) {
    const sections: Array<[string, string]> = [
        ['Patient concern', summary.chiefComplaint],
        ['History of present illness', summary.historyOfPresentIllness],
        ['Examination findings', summary.examinationFindings],
        ['Assessment and diagnosis', summary.assessmentAndDiagnosis],
        ['Treatment plan', summary.treatmentPlan],
        ['Follow-up instructions', summary.followUpInstructions],
        ['AI review', summary.aiReview ?? 'Pending doctor review'],
    ];

    return sections
        .map(([heading, value]) => `${heading}\n${value?.trim() || '-'}`)
        .join('\n\n');
}

function normalizeConversationTurns(value: unknown): ConsultationConversationTurn[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item): ConsultationConversationTurn | null => {
            if (!item || typeof item !== 'object') {
                return null;
            }

            const turn = item as { speaker?: unknown; text?: unknown };
            const speaker =
                turn.speaker === 'doctor' || turn.speaker === 'patient'
                    ? turn.speaker
                    : 'unknown';
            const text = typeof turn.text === 'string' ? turn.text.trim() : '';

            if (!text) {
                return null;
            }

            return { speaker, text };
        })
        .filter((turn): turn is ConsultationConversationTurn => Boolean(turn));
}

function fallbackConversationTurns(transcription: string): ConsultationConversationTurn[] {
    return [{ speaker: 'unknown', text: transcription }];
}
