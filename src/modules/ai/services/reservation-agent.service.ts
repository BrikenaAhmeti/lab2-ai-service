import { randomUUID } from 'crypto';
import { AiProvider } from '../../../infrastructure/ai/ai-provider';
import { ReservationMessage } from '../domain/ai.types';
import { AiReservationSessionModel } from '../infrastructure/ai-reservation-session.model';

interface SendReservationMessageInput {
    sessionId?: string;
    message: string;
    userId?: string;
    patientId?: string;
}

export class ReservationAgentService {
    constructor(private readonly provider: AiProvider) {}

    async sendMessage(input: SendReservationMessageInput) {
        const sessionId = input.sessionId || randomUUID();
        const existingSession = await AiReservationSessionModel.findOne({
            sessionId,
        }).lean();

        const history = (existingSession?.messages || []) as ReservationMessage[];
        const userMessage: ReservationMessage = {
            role: 'user',
            content: input.message,
            timestamp: new Date(),
        };

        const providerResult = await this.provider.answerReservationMessage({
            sessionId,
            patientId: input.patientId,
            messages: [...history, userMessage],
        });

        const assistantMessage: ReservationMessage = {
            role: 'assistant',
            content: providerResult.reply,
            timestamp: new Date(),
        };

        const session = await AiReservationSessionModel.findOneAndUpdate(
            { sessionId },
            {
                $set: {
                    sessionId,
                    userId: input.userId,
                    patientId: input.patientId,
                    messages: [...history, userMessage, assistantMessage],
                    suggestedDepartment: providerResult.suggestedDepartment,
                    suggestedStaff: providerResult.suggestedStaff,
                    outcome: providerResult.outcome,
                    appointmentId: providerResult.appointmentId,
                    model: providerResult.model,
                    tokenUsage: providerResult.tokenUsage,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();

        return {
            sessionId,
            reply: providerResult.reply,
            outcome: providerResult.outcome,
            appointmentId: providerResult.appointmentId,
            session,
        };
    }
}
