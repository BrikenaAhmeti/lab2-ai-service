import { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { AppError } from '../core/errors/app-error';

export function requireInternalApiKey(
    req: Request,
    _res: Response,
    next: NextFunction,
) {
    if (!env.internalApiKey && env.nodeEnv !== 'production') {
        next();
        return;
    }

    if (!env.internalApiKey) {
        throw new AppError('INTERNAL_API_KEY is required for internal AI routes', 503);
    }

    if (req.header('x-internal-api-key') !== env.internalApiKey) {
        throw new AppError('Unauthorized internal request', 401);
    }

    next();
}
