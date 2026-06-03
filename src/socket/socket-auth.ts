import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { env } from '../config/env';

interface SocketJwtPayload {
    sub?: string;
    userId?: string;
    id?: string;
    email?: string;
    roles?: string[];
    permissions?: string[];
}

export interface SocketUser {
    id: string;
    email?: string;
    roles: string[];
    permissions: string[];
}

export type AuthenticatedSocket = Socket & {
    user?: SocketUser;
};

export async function authenticateSocket(socket: AuthenticatedSocket) {
    const token = getSocketToken(socket);

    if (!token) {
        throw new Error('Missing socket auth token');
    }

    if (env.jwtAccessSecret) {
        return verifyLocalJwt(token);
    }

    return verifyWithAuthService(token);
}

function getSocketToken(socket: Socket) {
    const authToken = socket.handshake.auth?.token;
    const header = socket.handshake.headers.authorization;

    if (typeof authToken === 'string' && authToken.trim()) {
        return authToken.trim();
    }

    if (typeof header === 'string' && header.startsWith('Bearer ')) {
        return header.slice(7).trim();
    }

    return undefined;
}

function verifyLocalJwt(token: string): SocketUser {
    try {
        const payload = jwt.verify(token, env.jwtAccessSecret) as SocketJwtPayload;
        const userId = payload.sub || payload.userId || payload.id;

        if (!userId) {
            throw new Error('Invalid socket auth token');
        }

        return {
            id: userId,
            email: payload.email,
            roles: normalizeStringArray(payload.roles),
            permissions: normalizeStringArray(payload.permissions),
        };
    } catch {
        throw new Error('Invalid socket auth token');
    }
}

async function verifyWithAuthService(token: string): Promise<SocketUser> {
    const response = await fetch(new URL('/api/auth/me', env.authServiceUrl), {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error('Invalid socket auth token');
    }

    const body = (await response.json()) as SocketJwtPayload & { id?: string };
    const userId = body.sub || body.userId || body.id;

    if (!userId) {
        throw new Error('Invalid socket auth token');
    }

    return {
        id: userId,
        email: body.email,
        roles: normalizeStringArray(body.roles),
        permissions: normalizeStringArray(body.permissions),
    };
}

function normalizeStringArray(value: unknown) {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
}
