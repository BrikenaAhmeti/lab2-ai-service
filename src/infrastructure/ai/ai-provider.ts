import OpenAI, { toFile } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { AppError } from '../../shared/core/errors/app-error';
import { env } from '../../config/env';
import {
    ConsultationSummary,
    LabInterpretationResult,
    LabResultItem,
    PatientContext,
    ReservationAgentResult,
    ReservationMessage,
    SummaryResult,
    TokenUsage,
    TranscriptionResult,
    UploadedAudio,
} from '../../modules/ai/domain/ai.types';
import {
    buildClinicalRangeSummary,
    buildPatientSafeLabInterpretation,
    isUnsafeLabInterpretationText,
    LAB_INTERPRETATION_SYSTEM_PROMPT,
} from '../../modules/ai/domain/lab-interpretation-guidance';

export interface SummarizeConsultationInput {
    transcription: string;
    context?: Record<string, unknown>;
}

export interface InterpretLabResultsInput {
    labOrderId: string;
    results: LabResultItem[];
    patientContext?: PatientContext;
}

export interface ReservationAgentInput {
    sessionId: string;
    messages: ReservationMessage[];
    patientId?: string;
}

export interface AiProvider {
    transcribeAudio(file: UploadedAudio): Promise<TranscriptionResult>;
    summarizeConsultation(input: SummarizeConsultationInput): Promise<SummaryResult>;
    interpretLabResults(
        input: InterpretLabResultsInput,
    ): Promise<LabInterpretationResult>;
    answerReservationMessage(
        input: ReservationAgentInput,
    ): Promise<ReservationAgentResult>;
}

export class StubAiProvider implements AiProvider {
    async transcribeAudio(file: UploadedAudio): Promise<TranscriptionResult> {
        return {
            text: `Stub transcription generated for ${file.originalName}.`,
            model: 'stub-transcription',
        };
    }

    async summarizeConsultation(
        input: SummarizeConsultationInput,
    ): Promise<SummaryResult> {
        return {
            summary: {
                chiefComplaint: 'Pending doctor review',
                historyOfPresentIllness: input.transcription,
                examinationFindings: 'Pending doctor review',
                assessmentAndDiagnosis: 'Pending doctor review',
                treatmentPlan: 'Pending doctor review',
                followUpInstructions: 'Pending doctor review',
            },
            model: 'stub-summary',
        };
    }

    async interpretLabResults(
        input: InterpretLabResultsInput,
    ): Promise<LabInterpretationResult> {
        const safeInterpretation = buildPatientSafeLabInterpretation(input.results);

        return {
            clinicalInterpretation: buildClinicalRangeSummary(input.results),
            patientInterpretation: safeInterpretation.patientInterpretation,
            disclaimer: safeInterpretation.disclaimer,
            riskFlags: safeInterpretation.riskFlags,
            recommendations: safeInterpretation.recommendations,
            model: 'stub-lab-interpretation',
        };
    }

    async answerReservationMessage(
        input: ReservationAgentInput,
    ): Promise<ReservationAgentResult> {
        const latestUserMessage = [...input.messages]
            .reverse()
            .find((message) => message.role === 'user');

        return {
            reply:
                latestUserMessage?.content.toLowerCase().includes('advice')
                    ? 'I can help with booking appointments, but I cannot provide medical advice. Please contact a healthcare professional for clinical questions.'
                    : 'I can help you book an appointment. Please share the department, preferred date, and whether you have a preferred doctor.',
            outcome: 'in_progress',
            model: 'stub-reservation-agent',
        };
    }
}

export class OpenAiProvider implements AiProvider {
    private readonly client: OpenAI;

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new AppError('OPENAI_API_KEY is required when AI_PROVIDER_MODE=openai', 503);
        }

        this.client = new OpenAI({ apiKey });
    }

    async transcribeAudio(file: UploadedAudio): Promise<TranscriptionResult> {
        const upload = await toFile(file.buffer, file.originalName, {
            type: file.mimeType,
        });

        const transcription = await this.client.audio.transcriptions.create({
            file: upload,
            model: env.openAiTranscriptionModel,
        });

        return {
            text: transcription.text,
            model: env.openAiTranscriptionModel,
        };
    }

    async summarizeConsultation(
        input: SummarizeConsultationInput,
    ): Promise<SummaryResult> {
        const completion = await this.client.chat.completions.create({
            model: env.openAiTextModel,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content:
                        'Return only JSON for a medical consultation summary with keys chiefComplaint, historyOfPresentIllness, examinationFindings, assessmentAndDiagnosis, treatmentPlan, followUpInstructions. Do not invent facts that are not in the transcript.',
                },
                {
                    role: 'user',
                    content: JSON.stringify(input),
                },
            ],
        });

        const content = completion.choices[0]?.message?.content;
        const summary = parseJson<ConsultationSummary>(
            content,
            'OpenAI summary response was not valid JSON',
        );

        return {
            summary,
            model: env.openAiTextModel,
            tokenUsage: tokenUsageFrom(completion.usage),
        };
    }

    async interpretLabResults(
        input: InterpretLabResultsInput,
    ): Promise<LabInterpretationResult> {
        const completion = await this.client.chat.completions.create({
            model: env.openAiTextModel,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: LAB_INTERPRETATION_SYSTEM_PROMPT,
                },
                {
                    role: 'user',
                    content: JSON.stringify(input),
                },
            ],
        });

        const content = completion.choices[0]?.message?.content;
        const interpretation = parseJson<
            Omit<LabInterpretationResult, 'model' | 'tokenUsage'>
        >(content, 'OpenAI lab interpretation response was not valid JSON');
        const safeInterpretation = buildPatientSafeLabInterpretation(input.results);
        const clinicalInterpretation =
            typeof interpretation.clinicalInterpretation === 'string' &&
            interpretation.clinicalInterpretation.trim() &&
            !isUnsafeLabInterpretationText(interpretation.clinicalInterpretation)
                ? interpretation.clinicalInterpretation.trim()
                : buildClinicalRangeSummary(input.results);

        return {
            clinicalInterpretation,
            patientInterpretation: safeInterpretation.patientInterpretation,
            disclaimer: safeInterpretation.disclaimer,
            riskFlags: safeInterpretation.riskFlags,
            recommendations: safeInterpretation.recommendations,
            model: env.openAiTextModel,
            tokenUsage: tokenUsageFrom(completion.usage),
        };
    }

    async answerReservationMessage(
        input: ReservationAgentInput,
    ): Promise<ReservationAgentResult> {
        const historyMessages: ChatCompletionMessageParam[] = input.messages.flatMap(
            (message): ChatCompletionMessageParam[] => {
                if (message.role === 'user') {
                    return [{ role: 'user', content: message.content }];
                }

                if (message.role === 'assistant') {
                    return [{ role: 'assistant', content: message.content }];
                }

                return [];
            },
        );

        const completion = await this.client.chat.completions.create({
            model: env.openAiTextModel,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are MedSphere reservation assistant. Help users book appointments only. Do not provide diagnosis, treatment, triage, or medical advice. Ask for missing booking details and redirect clinical questions to a healthcare professional.',
                },
                ...historyMessages,
            ],
        });

        return {
            reply:
                completion.choices[0]?.message?.content ??
                'I can help with appointment booking. Please share the department and preferred time.',
            outcome: 'in_progress',
            model: env.openAiTextModel,
            tokenUsage: tokenUsageFrom(completion.usage),
        };
    }
}

export function createAiProvider(): AiProvider {
    if (env.aiProviderMode === 'openai') {
        return new OpenAiProvider(env.openAiApiKey);
    }

    return new StubAiProvider();
}

function parseJson<T>(content: string | null | undefined, errorMessage: string): T {
    if (!content) {
        throw new AppError(errorMessage, 502);
    }

    try {
        return JSON.parse(content) as T;
    } catch {
        throw new AppError(errorMessage, 502);
    }
}

function tokenUsageFrom(usage: unknown): TokenUsage | undefined {
    if (!usage || typeof usage !== 'object') {
        return undefined;
    }

    const tokenUsage = usage as {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };

    return {
        promptTokens: tokenUsage.prompt_tokens,
        completionTokens: tokenUsage.completion_tokens,
        totalTokens: tokenUsage.total_tokens,
    };
}
