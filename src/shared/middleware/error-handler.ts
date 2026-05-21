import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../core/errors/app-error';

export function errorHandler(
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction,
) {
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            message: error.message,
        });
    }

    if (error instanceof ZodError) {
        return res.status(400).json({
            message: 'Validation failed',
            issues: error.issues,
        });
    }

    if (error instanceof MulterError) {
        return res.status(400).json({
            message: error.message,
        });
    }

    return res.status(500).json({
        message: 'Internal server error',
    });
}
