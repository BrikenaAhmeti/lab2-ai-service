import { randomUUID } from 'crypto';
import { AppError } from '../../../shared/core/errors/app-error';
import { AiProvider } from '../../../infrastructure/ai/ai-provider';
import { DashboardHelperMessage } from '../domain/ai.types';
import { AiDashboardHelperSessionModel } from '../infrastructure/ai-dashboard-helper-session.model';
import { getDashboardHelperKnowledgeBase } from './dashboard-helper-knowledge.service';

interface SendDashboardHelperMessageInput {
    sessionId?: string;
    message: string;
    userId: string;
    patientId?: string;
    role: string;
    portalTitle?: string;
    permissions?: string[];
}

export class DashboardHelperChatService {
    constructor(private readonly provider: AiProvider) {}

    async sendMessage(input: SendDashboardHelperMessageInput) {
        const sessionId = input.sessionId || randomUUID();
        const now = new Date();
        const existingSession = await AiDashboardHelperSessionModel.findOne({
            sessionId,
        }).lean();

        if (existingSession && existingSession.userId !== input.userId) {
            throw new AppError('Dashboard helper session does not belong to user', 403);
        }

        const history = (existingSession?.messages || []) as DashboardHelperMessage[];
        const userMessage: DashboardHelperMessage = {
            role: 'user',
            content: input.message,
            timestamp: now,
        };

        await this.appendSessionEvent({
            ...input,
            sessionId,
            message: userMessage,
            logEvent: existingSession ? 'message_received' : 'session_started',
            logMessage: existingSession
                ? 'Dashboard helper user message received'
                : 'Dashboard helper session started',
            at: now,
        });

        try {
            await this.appendLog(sessionId, 'typing_started', 'Dashboard helper typing started');

            const providerResult = await this.provider.answerDashboardHelperQuestion({
                sessionId,
                question: input.message,
                role: input.role,
                portalTitle: input.portalTitle,
                permissions: input.permissions,
                messages: [...history, userMessage],
                knowledgeBase: getDashboardHelperKnowledgeBase(),
            });

            const assistantMessage: DashboardHelperMessage = {
                role: 'assistant',
                content: providerResult.reply,
                timestamp: new Date(),
            };

            const session = await this.appendSessionEvent({
                ...input,
                sessionId,
                message: assistantMessage,
                model: providerResult.model,
                tokenUsage: providerResult.tokenUsage,
                logEvent: 'message_answered',
                logMessage: 'Dashboard helper assistant answer generated',
                at: assistantMessage.timestamp!,
            });

            return {
                sessionId,
                reply: providerResult.reply,
                model: providerResult.model,
                session,
            };
        } catch (error) {
            await AiDashboardHelperSessionModel.findOneAndUpdate(
                { sessionId },
                {
                    $push: {
                        logs: {
                            $each: [
                                {
                                    event: 'error',
                                    message:
                                        error instanceof Error
                                            ? error.message
                                            : 'Dashboard helper answer failed',
                                    timestamp: new Date(),
                                },
                            ],
                            $slice: -100,
                        },
                    },
                },
                { returnDocument: 'after' },
            );

            throw error;
        }
    }

    private async appendLog(
        sessionId: string,
        event: 'typing_started' | 'error',
        message: string,
    ) {
        await AiDashboardHelperSessionModel.findOneAndUpdate(
            { sessionId },
            {
                $push: {
                    logs: {
                        $each: [
                            {
                                event,
                                message,
                                timestamp: new Date(),
                            },
                        ],
                        $slice: -100,
                    },
                },
            },
            { returnDocument: 'after' },
        );
    }

    private async appendSessionEvent(input: {
        sessionId: string;
        userId: string;
        patientId?: string;
        role: string;
        portalTitle?: string;
        permissions?: string[];
        message: DashboardHelperMessage;
        model?: string;
        tokenUsage?: unknown;
        logEvent:
            | 'session_started'
            | 'message_received'
            | 'message_answered';
        logMessage: string;
        at: Date;
    }) {
        return AiDashboardHelperSessionModel.findOneAndUpdate(
            { sessionId: input.sessionId },
            {
                $set: {
                    sessionId: input.sessionId,
                    userId: input.userId,
                    patientId: input.patientId,
                    role: input.role,
                    portalTitle: input.portalTitle,
                    permissions: input.permissions ?? [],
                    model: input.model,
                    tokenUsage: input.tokenUsage,
                    lastMessageAt: input.at,
                },
                $push: {
                    messages: input.message,
                    logs: {
                        $each: [
                            {
                                event: input.logEvent,
                                message: input.logMessage,
                                timestamp: input.at,
                            },
                        ],
                        $slice: -100,
                    },
                },
            },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        ).lean();
    }
}
