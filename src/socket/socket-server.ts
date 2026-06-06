import { randomUUID } from 'crypto';
import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { corsOrigin } from '../config/cors';
import { createAiProvider } from '../infrastructure/ai/ai-provider';
import { DashboardHelperChatService } from '../modules/ai/services/dashboard-helper-chat.service';
import {
    AuthenticatedSocket,
    authenticateSocket,
    SocketUser,
} from './socket-auth';

const dashboardHelperMessageSchema = z.object({
    sessionId: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).max(4000),
    role: z.string().trim().min(1).max(80),
    portalTitle: z.string().trim().min(1).max(120).optional(),
    patientId: z.string().trim().min(1).optional(),
});

type DashboardHelperAck = (response: {
    ok: boolean;
    sessionId?: string;
    error?: string;
}) => void;

export function createSocketServer(httpServer: HttpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: corsOrigin,
            credentials: true,
        },
    });
    const dashboardHelperService = new DashboardHelperChatService(createAiProvider());

    io.use((socket: AuthenticatedSocket, next) => {
        void authenticateSocket(socket)
            .then((user) => {
                socket.user = user;
                next();
            })
            .catch((error: unknown) => {
                next(
                    new Error(
                        error instanceof Error
                            ? error.message
                            : 'Invalid socket auth token',
                    ),
                );
            });
    });

    io.on('connection', (socket: AuthenticatedSocket) => {
        if (!socket.user) {
            socket.disconnect(true);
            return;
        }

        socket.join(`user:${socket.user.id}`);
        console.info('[dashboard-helper] socket connected', {
            socketId: socket.id,
            userId: socket.user.id,
        });

        socket.emit('dashboard-helper:ready', {
            userId: socket.user.id,
            roles: socket.user.roles,
        });

        socket.on(
            'dashboard-helper:message',
            (payload: unknown, acknowledge?: DashboardHelperAck) => {
                void handleDashboardHelperMessage({
                    socket,
                    payload,
                    acknowledge,
                    dashboardHelperService,
                });
            },
        );

        socket.on('disconnect', (reason) => {
            console.info('[dashboard-helper] socket disconnected', {
                socketId: socket.id,
                userId: socket.user?.id,
                reason,
            });
        });
    });

    return io;
}

async function handleDashboardHelperMessage(input: {
    socket: AuthenticatedSocket;
    payload: unknown;
    acknowledge?: DashboardHelperAck;
    dashboardHelperService: DashboardHelperChatService;
}) {
    const { socket, payload, acknowledge, dashboardHelperService } = input;
    const user = socket.user;

    if (!user) {
        emitDashboardHelperError(socket, acknowledge, 'Unauthenticated socket');
        return;
    }

    const parsed = dashboardHelperMessageSchema.safeParse(payload);

    if (!parsed.success) {
        emitDashboardHelperError(socket, acknowledge, 'Invalid dashboard helper message');
        return;
    }

    if (!roleBelongsToUser(parsed.data.role, user)) {
        emitDashboardHelperError(
            socket,
            acknowledge,
            'Dashboard helper role must match authenticated user role',
        );
        return;
    }

    const sessionId = parsed.data.sessionId || randomUUID();

    console.info('[dashboard-helper] message received', {
        sessionId,
        userId: user.id,
        role: parsed.data.role,
    });

    socket.emit('dashboard-helper:typing', {
        sessionId,
        isTyping: true,
    });

    try {
        const result = await dashboardHelperService.sendMessage({
            sessionId,
            message: parsed.data.message,
            userId: user.id,
            patientId: parsed.data.patientId,
            role: parsed.data.role,
            portalTitle: parsed.data.portalTitle,
            permissions: user.permissions,
        });

        socket.emit('dashboard-helper:message', {
            sessionId,
            role: 'assistant',
            content: result.reply,
            model: result.model,
            timestamp: new Date().toISOString(),
        });
        acknowledge?.({ ok: true, sessionId });

        console.info('[dashboard-helper] message answered', {
            sessionId,
            userId: user.id,
            role: parsed.data.role,
            model: result.model,
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : 'Dashboard helper could not answer';

        emitDashboardHelperError(socket, acknowledge, message, sessionId);
        console.error('[dashboard-helper] message failed', {
            sessionId,
            userId: user.id,
            role: parsed.data.role,
            error,
        });
    } finally {
        socket.emit('dashboard-helper:typing', {
            sessionId,
            isTyping: false,
        });
    }
}

function emitDashboardHelperError(
    socket: AuthenticatedSocket,
    acknowledge: DashboardHelperAck | undefined,
    message: string,
    sessionId?: string,
) {
    socket.emit('dashboard-helper:error', {
        sessionId,
        message,
    });
    acknowledge?.({
        ok: false,
        sessionId,
        error: message,
    });
}

function roleBelongsToUser(role: string, user: SocketUser) {
    if (user.roles.length === 0) {
        return true;
    }

    const requestedRole = normalizeRole(role);

    return user.roles.some((userRole) => normalizeRole(userRole) === requestedRole);
}

function normalizeRole(role: string) {
    const normalized = role.trim().toLowerCase().replace(/[\s_-]+/g, '');
    const aliases: Record<string, string> = {
        lab: 'labtechnician',
        labtech: 'labtechnician',
        laboratory: 'labtechnician',
        pharmacy: 'pharmacist',
    };

    return aliases[normalized] ?? normalized;
}
