import OpenAI, { toFile } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { AppError } from '../../shared/core/errors/app-error';
import { env } from '../../config/env';
import {
    ConsultationConversationTurn,
    ConsultationSummary,
    DashboardHelperMessage,
    DashboardHelperResult,
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
    conversationTurns?: ConsultationConversationTurn[];
    context?: Record<string, unknown>;
}

export interface StructureConsultationConversationInput {
    transcription: string;
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

export interface DashboardHelperInput {
    sessionId: string;
    question: string;
    role: string;
    portalTitle?: string;
    permissions?: string[];
    messages: DashboardHelperMessage[];
    knowledgeBase: string;
}

export interface AiProvider {
    transcribeAudio(file: UploadedAudio): Promise<TranscriptionResult>;
    structureConsultationConversation(
        input: StructureConsultationConversationInput,
    ): Promise<ConsultationConversationTurn[]>;
    summarizeConsultation(input: SummarizeConsultationInput): Promise<SummaryResult>;
    interpretLabResults(
        input: InterpretLabResultsInput,
    ): Promise<LabInterpretationResult>;
    answerReservationMessage(
        input: ReservationAgentInput,
    ): Promise<ReservationAgentResult>;
    answerDashboardHelperQuestion(
        input: DashboardHelperInput,
    ): Promise<DashboardHelperResult>;
}

export class StubAiProvider implements AiProvider {
    async transcribeAudio(file: UploadedAudio): Promise<TranscriptionResult> {
        return {
            text: `Stub transcription generated for ${file.originalName}.`,
            model: 'stub-transcription',
        };
    }

    async structureConsultationConversation(
        input: StructureConsultationConversationInput,
    ): Promise<ConsultationConversationTurn[]> {
        return normalizeConversationTurns([
            {
                speaker: 'unknown',
                text: input.transcription,
            },
        ]);
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
                aiReview: 'Pending doctor review',
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

    async answerDashboardHelperQuestion(
        input: DashboardHelperInput,
    ): Promise<DashboardHelperResult> {
        const question = input.question.toLowerCase();

        if (containsClinicalAdviceRequest(question)) {
            return {
                reply: DASHBOARD_HELPER_CLINICAL_REPLY,
                model: 'stub-dashboard-helper',
            };
        }

        if (questionMentionsDifferentRole(question, input.role)) {
            return {
                reply: DASHBOARD_HELPER_PERMISSION_REPLY,
                model: 'stub-dashboard-helper',
            };
        }

        const knowledgeAnswer = buildKnowledgeBaseDashboardHelperAnswer(input);

        if (!knowledgeAnswer) {
            return {
                reply: DASHBOARD_HELPER_NO_INFO_REPLY,
                model: 'stub-dashboard-helper',
            };
        }

        return {
            reply: knowledgeAnswer.reply,
            model: 'stub-dashboard-helper',
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

    async structureConsultationConversation(
        input: StructureConsultationConversationInput,
    ): Promise<ConsultationConversationTurn[]> {
        const completion = await this.client.chat.completions.create({
            model: env.openAiTextModel,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content:
                        [
                            'Return only JSON with key conversation.',
                            'conversation must be an array of chronological turns with fields speaker and text.',
                            'speaker must be exactly one of doctor, patient, or unknown.',
                            'Split the transcript into doctor/patient turns using clinical dialogue cues.',
                            'Do not add, remove, summarize, or invent clinical facts.',
                            'Keep the original meaning and wording as much as possible, but remove repeated filler if needed for readability.',
                            'Merge adjacent sentences only when they belong to the same speaker.',
                            'Use unknown only when the speaker cannot reasonably be inferred.',
                        ].join(' '),
                },
                {
                    role: 'user',
                    content: JSON.stringify(input),
                },
            ],
        });

        const content = completion.choices[0]?.message?.content;
        const result = parseJson<{ conversation?: unknown; turns?: unknown }>(
            content,
            'OpenAI conversation response was not valid JSON',
        );

        return normalizeConversationTurns(result.conversation ?? result.turns);
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
                        [
                            'Return only JSON for a clinician-reviewed medical consultation draft with keys chiefComplaint, historyOfPresentIllness, examinationFindings, assessmentAndDiagnosis, treatmentPlan, followUpInstructions, aiReview.',
                            'The chiefComplaint value is displayed as Patient concern; write the patient main concern in patient-focused wording.',
                            'Do not prefix any JSON value with its section heading.',
                            'Use the transcript and conversationTurns as the source of truth for what happened in this visit.',
                            'Use clinical context only as background: allergies, medical notes, recent diagnoses, prior treatment plans, and recent medications may inform caution or continuity, but do not turn background context into a new complaint, diagnosis, treatment, or instruction unless supported by the transcript.',
                            'The aiReview section is a concise clinician-facing review of key risks, context-based cautions, and items the doctor should verify before finalizing.',
                            'Do not include patient name, email, phone, address, personal number, or emergency contact details.',
                            'Do not invent facts. If a section is not supported by the transcript, write "Pending doctor review".',
                        ].join(' '),
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

    async answerDashboardHelperQuestion(
        input: DashboardHelperInput,
    ): Promise<DashboardHelperResult> {
        if (containsClinicalAdviceRequest(input.question.toLowerCase())) {
            return {
                reply: DASHBOARD_HELPER_CLINICAL_REPLY,
                model: env.openAiTextModel,
            };
        }

        if (questionMentionsDifferentRole(input.question.toLowerCase(), input.role)) {
            return {
                reply: DASHBOARD_HELPER_PERMISSION_REPLY,
                model: env.openAiTextModel,
            };
        }

        const knowledgeAnswer = buildKnowledgeBaseDashboardHelperAnswer(input);

        if (!knowledgeAnswer) {
            return {
                reply: DASHBOARD_HELPER_NO_INFO_REPLY,
                model: env.openAiTextModel,
            };
        }

        const historyMessages: ChatCompletionMessageParam[] = input.messages
            .slice(-12)
            .map((message): ChatCompletionMessageParam => ({
                role: message.role,
                content: message.content,
            }));

        const completion = await this.client.chat.completions.create({
            model: env.openAiTextModel,
            messages: [
                {
                    role: 'system',
                    content: buildDashboardHelperSystemPrompt({
                        ...input,
                        knowledgeBase: knowledgeAnswer.context,
                    }),
                },
                ...historyMessages,
            ],
        });

        return {
            reply:
                completion.choices[0]?.message?.content ??
                'I can help with dashboard navigation. Please ask about a screen or workflow.',
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

function buildDashboardHelperSystemPrompt(input: DashboardHelperInput) {
    return [
        'You are the MedSphere UBT dashboard assistant inside the authenticated dashboard chat widget.',
        'Use only the MedSphere Role Portal User Friendly Knowledge Base excerpt below.',
        'Answer only for the current frontend-provided role and assigned permissions.',
        'Do not explain screens, buttons, workflows, or actions for another role.',
        'Do not infer from general healthcare, SaaS, or dashboard knowledge.',
        'Keep answers short, practical, and action-oriented. Mention exact screen names when useful.',
        `If a screen or action may be hidden, reply exactly: "${DASHBOARD_HELPER_PERMISSION_REPLY}"`,
        `Do not provide medical diagnosis, treatment, medication, or prescription advice. For those requests, reply exactly: "${DASHBOARD_HELPER_CLINICAL_REPLY}"`,
        `If the knowledge base does not contain the answer, reply exactly: "${DASHBOARD_HELPER_NO_INFO_REPLY}"`,
        'Never expose internal tokens, refresh tokens, user ids, database ids, passwords, private system secrets, or implementation credentials.',
        'The frontend shows a typing state while you generate. Do not mention socket internals unless the user asks about real-time updates.',
        '',
        `Current role: ${input.role}`,
        input.portalTitle ? `Current portal: ${input.portalTitle}` : '',
        input.permissions?.length
            ? `Authenticated user permissions: ${input.permissions.join(', ')}`
            : 'Authenticated user permissions: not supplied.',
        '',
        'Knowledge base:',
        input.knowledgeBase,
    ]
        .filter(Boolean)
        .join('\n');
}

function containsClinicalAdviceRequest(question: string) {
    const clinicalTerms = [
        'diagnose',
        'diagnosis',
        'treatment',
        'prescribe',
        'dose',
        'dosage',
        'medicine',
        'medication',
        'lab result mean',
        'what does my result mean',
        'should i take',
        'symptom',
    ];

    return clinicalTerms.some((term) => question.includes(term));
}

const DASHBOARD_HELPER_CLINICAL_REPLY =
    'I cannot provide medical advice or diagnosis. Please contact a qualified medical professional.';

const DASHBOARD_HELPER_PERMISSION_REPLY =
    'Your role or permissions may not include that module.';

const DASHBOARD_HELPER_NO_INFO_REPLY =
    'I do not have that information in the MedSphere role portal knowledge base. Please contact info@medsphere.com or use Contact Us on the website.';

interface KnowledgeBaseAnswer {
    reply: string;
    context: string;
}

interface KnowledgeBaseRow {
    tableNumber: number;
    header: string[];
    cells: string[];
    text: string;
}

type DashboardRoleKey =
    | 'public'
    | 'patient'
    | 'receptionist'
    | 'doctor'
    | 'nurse'
    | 'labtechnician'
    | 'pharmacist'
    | 'admin'
    | 'superadmin';

const ROLE_TABLES: Record<DashboardRoleKey, number[]> = {
    public: [5, 6, 7, 8],
    patient: [9, 10, 11, 12],
    receptionist: [13, 14, 15, 16],
    doctor: [17, 18, 19, 20],
    nurse: [21, 22, 23, 24],
    labtechnician: [25, 26, 27, 28],
    pharmacist: [29, 30, 31, 32],
    admin: [33, 34, 35, 36],
    superadmin: [33, 34, 35, 36],
};

const ROLE_SHARED_TABLES: Record<DashboardRoleKey, number[]> = {
    public: [2, 3, 4, 37, 41, 42],
    patient: [2, 3, 4, 37, 38, 42],
    receptionist: [2, 3, 4, 37, 38, 42],
    doctor: [2, 3, 4, 37, 42],
    nurse: [2, 3, 4, 42],
    labtechnician: [2, 3, 4, 42],
    pharmacist: [2, 3, 4, 42],
    admin: [2, 3, 4, 37, 38, 39, 40, 41, 42],
    superadmin: [2, 3, 4, 37, 38, 39, 40, 41, 42],
};

const ROLE_ALIASES: Record<DashboardRoleKey, string[]> = {
    public: ['public', 'visitor', 'website user', 'guest'],
    patient: ['patient'],
    receptionist: ['receptionist', 'front desk'],
    doctor: ['doctor', 'physician'],
    nurse: ['nurse'],
    labtechnician: ['lab technician', 'lab tech', 'laboratory technician'],
    pharmacist: ['pharmacist'],
    admin: ['admin', 'administrator'],
    superadmin: ['super admin', 'superadmin', 'super administrator'],
};

const DOCUMENT_FEATURE_TERMS = [
    'dashboard',
    'appointment',
    'book appointment',
    'my appointments',
    'check in',
    'no-show',
    'walk-in',
    'patient',
    'medical record',
    'lab result',
    'lab order',
    'prescription',
    'pharmacy queue',
    'billing',
    'payment',
    'feedback',
    'message',
    'profile',
    'session',
    'notification',
    'department',
    'service',
    'staff',
    'inventory',
    'stock',
    'low stock',
    'report',
    'advanced search',
    'cms',
    'contact',
    'settings',
    'ai summary',
    'ai report',
    'vitals',
    'triage',
    'queue',
    'password',
    'registration',
    'cancel',
    'reschedule',
    'download',
    'real-time',
    'realtime',
];

const STOP_WORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'can',
    'cannot',
    'do',
    'does',
    'for',
    'from',
    'how',
    'i',
    'if',
    'in',
    'is',
    'it',
    'me',
    'my',
    'of',
    'on',
    'or',
    'should',
    'that',
    'the',
    'their',
    'this',
    'to',
    'what',
    'when',
    'where',
    'who',
    'why',
    'with',
    'you',
    'your',
]);

function buildKnowledgeBaseDashboardHelperAnswer(
    input: DashboardHelperInput,
): KnowledgeBaseAnswer | null {
    const roleKey = normalizeDashboardRoleKey(input.role);

    if (!roleKey) {
        return null;
    }

    const rows = parseKnowledgeBaseRows(input.knowledgeBase);
    const allowedTables = new Set([
        ...ROLE_TABLES[roleKey],
        ...ROLE_SHARED_TABLES[roleKey],
    ]);
    const scopedRows = rows.filter((row) => allowedTables.has(row.tableNumber));
    const scoredRows = scoreKnowledgeRows(scopedRows, input.question);
    const bestRow = scoredRows[0];

    if (bestRow && bestRow.score >= scoreThresholdFor(input.question)) {
        const contextRows = scoredRows
            .slice(0, 4)
            .filter((row) => row.score > 0)
            .map((row) => row.row);

        return {
            reply: replyFromKnowledgeRow(bestRow.row),
            context: buildKnowledgeContext(input.role, contextRows),
        };
    }

    if (isPermissionQuestion(input.question) || isKnownDocumentFeature(input.question)) {
        return {
            reply: DASHBOARD_HELPER_PERMISSION_REPLY,
            context: buildKnowledgeContext(
                input.role,
                rows.filter((row) => row.tableNumber === 42).slice(0, 3),
            ),
        };
    }

    return null;
}

function parseKnowledgeBaseRows(knowledgeBase: string): KnowledgeBaseRow[] {
    const rows: KnowledgeBaseRow[] = [];
    const headersByTable = new Map<number, string[]>();
    let currentTable: number | null = null;

    for (const line of knowledgeBase.split(/\r?\n/)) {
        const tableMatch = line.match(/^## Table (\d+)/);

        if (tableMatch) {
            currentTable = Number(tableMatch[1]);
            continue;
        }

        if (!currentTable || !line.includes(' | ')) {
            continue;
        }

        const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);

        if (!headersByTable.has(currentTable)) {
            headersByTable.set(currentTable, cells);
            continue;
        }

        rows.push({
            tableNumber: currentTable,
            header: headersByTable.get(currentTable) ?? [],
            cells,
            text: cells.join(' '),
        });
    }

    return rows;
}

function scoreKnowledgeRows(rows: KnowledgeBaseRow[], question: string) {
    const normalizedQuestion = normalizeSearchText(question);
    const questionTokens = new Set(tokenize(question));

    return rows
        .map((row) => {
            const rowTokens = new Set(tokenize(row.text));
            const firstCellTokens = new Set(tokenize(row.cells[0] ?? ''));
            let score = 0;

            for (const token of questionTokens) {
                if (rowTokens.has(token)) {
                    score += firstCellTokens.has(token) ? 2 : 1;
                }
            }

            const firstCell = normalizeSearchText(row.cells[0] ?? '');
            if (firstCell.length >= 4 && normalizedQuestion.includes(firstCell)) {
                score += 5;
            }

            if (row.header[0]?.toLowerCase() === 'user question') {
                score += scorePhraseOverlap(question, row.cells[0] ?? '') * 1.75;
            }

            if (isHowQuestion(question) && row.header[0]?.toLowerCase() === 'action') {
                score += 0.75;
            }

            if (isWhereQuestion(question) && row.header[0]?.toLowerCase() === 'screen') {
                score += 1;
            }

            if (isPermissionQuestion(question) && row.text.toLowerCase().includes('permission')) {
                score += 1.25;
            }

            return { row, score };
        })
        .sort((left, right) => right.score - left.score);
}

function scorePhraseOverlap(question: string, phrase: string) {
    const questionTokens = new Set(tokenize(question));
    const phraseTokens = tokenize(phrase);

    if (phraseTokens.length === 0) {
        return 0;
    }

    return phraseTokens.filter((token) => questionTokens.has(token)).length;
}

function scoreThresholdFor(question: string) {
    const tokenCount = tokenize(question).length;

    if (tokenCount <= 2) {
        return 2.5;
    }

    return 3;
}

function replyFromKnowledgeRow(row: KnowledgeBaseRow) {
    const header = row.header.map((cell) => cell.toLowerCase());

    if (header[0] === 'user question' && row.cells[1]) {
        return rewriteDocumentFallback(row.cells[1]);
    }

    if (header[0] === 'situation' && row.cells[1]) {
        return rewriteDocumentFallback(row.cells[1]);
    }

    if (header[0] === 'action') {
        return [row.cells[1], row.cells[2]].filter(Boolean).join(' ');
    }

    if (header[0] === 'screen') {
        return [row.cells[0] ? `Open ${row.cells[0]}.` : '', row.cells[1]]
            .filter(Boolean)
            .join(' ');
    }

    if (header[0] === 'when the user does this') {
        return row.cells[2] || row.cells[1] || DASHBOARD_HELPER_PERMISSION_REPLY;
    }

    if (header[0] === 'topic' && row.cells[1]) {
        return row.cells[1];
    }

    return rewriteDocumentFallback(row.cells.slice(1).join(' ') || row.text);
}

function rewriteDocumentFallback(reply: string) {
    if (reply.includes('I could not find this in the MedSphere dashboard knowledge base')) {
        return DASHBOARD_HELPER_NO_INFO_REPLY;
    }

    return reply;
}

function buildKnowledgeContext(role: string, rows: KnowledgeBaseRow[]) {
    return [
        `Current role scope: ${role}`,
        ...rows.map((row) => `Table ${row.tableNumber}: ${row.cells.join(' | ')}`),
    ].join('\n');
}

function questionMentionsDifferentRole(question: string, currentRole: string) {
    const currentRoleKey = normalizeDashboardRoleKey(currentRole);

    if (!currentRoleKey) {
        return false;
    }

    const normalizedQuestion = normalizeSearchText(question);

    return Object.entries(ROLE_ALIASES).some(([roleKey, aliases]) => {
        if (roleKey === currentRoleKey) {
            return false;
        }

        if (currentRoleKey === 'superadmin' && roleKey === 'admin') {
            return false;
        }

        return aliases.some((alias) => {
            const normalizedAlias = normalizeSearchText(alias);
            if (normalizedAlias.length <= 2) {
                return false;
            }

            return [
                `${normalizedAlias} portal`,
                `${normalizedAlias} dashboard`,
                `${normalizedAlias} screen`,
                `${normalizedAlias} workflow`,
                `as a ${normalizedAlias}`,
                `as ${normalizedAlias}`,
                `for ${normalizedAlias}`,
            ].some((phrase) => normalizedQuestion.includes(phrase));
        });
    });
}

function normalizeDashboardRoleKey(role: string): DashboardRoleKey | null {
    const normalized = normalizeSearchText(role).replace(/\s+/g, '');
    const aliases: Record<string, DashboardRoleKey> = {
        admin: 'admin',
        administrator: 'admin',
        doctor: 'doctor',
        frontdesk: 'receptionist',
        guest: 'public',
        lab: 'labtechnician',
        labtech: 'labtechnician',
        labtechnician: 'labtechnician',
        laboratorytechnician: 'labtechnician',
        nurse: 'nurse',
        patient: 'patient',
        pharmacist: 'pharmacist',
        pharmacy: 'pharmacist',
        public: 'public',
        receptionist: 'receptionist',
        superadmin: 'superadmin',
        superadministrator: 'superadmin',
        visitor: 'public',
        websiteuser: 'public',
    };

    return aliases[normalized] ?? null;
}

function isKnownDocumentFeature(question: string) {
    const normalizedQuestion = normalizeSearchText(question);

    return DOCUMENT_FEATURE_TERMS.some((term) =>
        normalizedQuestion.includes(normalizeSearchText(term)),
    );
}

function isPermissionQuestion(question: string) {
    const normalizedQuestion = normalizeSearchText(question);

    return [
        'cannot see',
        "can't see",
        'can not see',
        'why cant',
        'why can i not',
        'missing',
        'permission',
        'not allowed',
        'hidden',
        'access',
    ].some((phrase) => normalizedQuestion.includes(normalizeSearchText(phrase)));
}

function isHowQuestion(question: string) {
    return normalizeSearchText(question).startsWith('how ');
}

function isWhereQuestion(question: string) {
    return normalizeSearchText(question).startsWith('where ');
}

function tokenize(value: string) {
    const tokens = normalizeSearchText(value)
        .split(/\s+/)
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

    return Array.from(
        new Set(
            tokens.flatMap((token) =>
                token.length > 3 && token.endsWith('s')
                    ? [token, token.slice(0, -1)]
                    : [token],
            ),
        ),
    );
}

function normalizeSearchText(value: string) {
    return value
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^\w\s'-]/g, ' ')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
