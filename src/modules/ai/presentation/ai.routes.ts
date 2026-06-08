import { NextFunction, Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { z } from 'zod';
import { createAiProvider } from '../../../infrastructure/ai/ai-provider';
import { env } from '../../../config/env';
import { AppError } from '../../../shared/core/errors/app-error';
import { asyncHandler } from '../../../shared/http/async-handler';
import { requireInternalApiKey } from '../../../shared/middleware/internal-api-key';
import { ConsultationAiService } from '../services/consultation-ai.service';
import { storeConsultationAudio } from '../services/audio-storage.service';
import { LabInterpretationAiService } from '../services/lab-interpretation-ai.service';
import { ReservationAgentService } from '../services/reservation-agent.service';
import { VapiCallLogService } from '../services/vapi-call-log.service';
import { VapiToolsController } from './vapi-tools.controller';

const aiProvider = createAiProvider();
const consultationService = new ConsultationAiService(aiProvider);
const labInterpretationService = new LabInterpretationAiService(aiProvider);
const reservationAgentService = new ReservationAgentService(aiProvider);
const vapiToolsController = new VapiToolsController();
const vapiCallLogService = new VapiCallLogService();

const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: env.maxAudioFileSizeMb * 1024 * 1024,
    },
    fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('audio/')) {
            callback(new AppError('Only audio uploads are supported', 400));
            return;
        }

        callback(null, true);
    },
});

const optionalMetadataSchema = z.object({
    appointmentId: z.string().min(1).optional(),
    patientId: z.string().min(1).optional(),
    staffId: z.string().min(1).optional(),
    audioFileUrl: z.string().url().optional(),
    summarize: z
        .enum(['true', 'false'])
        .transform((value) => value === 'true')
        .optional(),
});

const summarizeSchema = z.object({
    appointmentId: z.string().min(1),
    patientId: z.string().min(1).optional(),
    staffId: z.string().min(1).optional(),
    transcription: z.string().min(1),
    context: z.record(z.string(), z.unknown()).optional(),
});

const updateConsultationSummarySchema = z
    .object({
        reportText: z.string().trim().min(1).optional(),
        summary: z
            .object({
                chiefComplaint: z.string(),
                historyOfPresentIllness: z.string(),
                examinationFindings: z.string(),
                assessmentAndDiagnosis: z.string(),
                treatmentPlan: z.string(),
                followUpInstructions: z.string(),
                aiReview: z.string().optional(),
            })
            .optional(),
        summaryStatus: z.enum(['draft', 'approved', 'discarded']).optional(),
    })
    .refine((body) => body.reportText || body.summary || body.summaryStatus, {
        message: 'At least one summary field is required',
    });

const labResultItemSchema = z.object({
    name: z.string().min(1),
    value: z.union([z.string(), z.number()]),
    unit: z.string().optional(),
    referenceRange: z.string().optional(),
    flag: z.enum(['low', 'normal', 'high', 'critical']).optional(),
});

const labInterpretationSchema = z.object({
    patientId: z.string().min(1).optional(),
    results: z.array(labResultItemSchema).min(1),
    patientContext: z
        .object({
            age: z.number().int().positive().optional(),
            gender: z.string().optional(),
            knownConditions: z.array(z.string()).optional(),
        })
        .optional(),
});

const reservationMessageSchema = z.object({
    sessionId: z.string().min(1).optional(),
    message: z.string().min(1),
    userId: z.string().min(1).optional(),
    patientId: z.string().min(1).optional(),
});

const vapiCallsQuerySchema = z.object({
    assistantId: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const aiRoutes = Router();

aiRoutes.get('/capabilities', (_req, res) => {
    res.json({
        service: 'medsphere-ai-service',
        providerMode: env.aiProviderMode,
        storage: 'mongodb',
        features: [
            {
                id: 'MS-33',
                name: 'Audio transcription and consultation summarization',
                endpoints: [
                    'POST /api/ai/transcribe',
                    'POST /api/ai/summarize',
                    'GET /api/ai/consultations/:appointmentId',
                    'PUT /api/ai/consultations/:appointmentId/summary',
                    'POST /api/ai/consultations/:appointmentId/approve',
                ],
            },
            {
                id: 'MS-34',
                name: 'Lab result interpretation',
                endpoints: [
                    'POST /api/ai/lab-results/:labOrderId/interpret',
                    'POST /api/ai/internal/lab-results/:labOrderId/interpret',
                    'GET /api/ai/lab-results/:labOrderId/interpretation',
                ],
            },
            {
                id: 'MS-55',
                name: 'Patient lab interpretation handoff',
                endpoints: ['GET /api/ai/lab-results/:labOrderId/interpretation'],
                responseShape: {
                    labOrderId: 'string',
                    patientVersion: 'string',
                    disclaimer: 'string?',
                    recommendations: 'string[]?',
                    riskFlags: 'string[]?',
                },
            },
            {
                id: 'MS-35',
                name: 'Reservation agent',
                endpoints: ['POST /api/ai/agent/message'],
            },
            {
                id: 'MS-56',
                name: 'Dashboard helper socket chat',
                sockets: {
                    namespace: '/',
                    clientEvents: ['dashboard-helper:message'],
                    serverEvents: [
                        'dashboard-helper:ready',
                        'dashboard-helper:typing',
                        'dashboard-helper:message',
                        'dashboard-helper:error',
                    ],
                },
            },
            {
                id: 'MS-VAPI-APPOINTMENTS',
                name: 'Vapi voice appointment tools',
                endpoints: [
                    'POST /api/ai/vapi/tools',
                    'GET /api/ai/vapi/calls',
                    'GET /api/ai/vapi/calls/:id',
                    'GET /api/ai/vapi/calls/:id/log',
                ],
                tools: [
                    'resolveAppointmentContext',
                    'checkAvailability',
                    'bookAppointment',
                ],
            },
        ],
    });
});

aiRoutes.post(
    '/transcribe',
    audioUpload.single('audio'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new AppError('Audio file is required in multipart field "audio"', 400);
        }

        const metadata = optionalMetadataSchema.parse(req.body);
        const storedAudio = await storeConsultationAudio(req.file);
        const audioFileUrl =
            metadata.audioFileUrl ?? absoluteUrl(req, storedAudio.relativeUrl);
        const result = await consultationService.transcribe({
            ...metadata,
            audioFileUrl,
            audioOriginalName: storedAudio.originalName,
            audioMimeType: storedAudio.mimeType,
            audioSizeBytes: storedAudio.sizeBytes,
            file: {
                buffer: req.file.buffer,
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
            },
        });

        res.json({
            ...result,
            audioFileUrl,
        });
    }),
);

aiRoutes.post(
    '/summarize',
    asyncHandler(async (req, res) => {
        const body = summarizeSchema.parse(req.body);
        const result = await consultationService.summarize(body);

        res.status(201).json(result);
    }),
);

aiRoutes.get(
    '/consultations/:appointmentId',
    asyncHandler(async (req, res) => {
        const conversation = await consultationService.getByAppointmentId(
            requiredParam(req.params.appointmentId, 'appointmentId'),
        );

        res.json(conversation);
    }),
);

aiRoutes.put(
    '/consultations/:appointmentId/summary',
    asyncHandler(async (req, res) => {
        const body = updateConsultationSummarySchema.parse(req.body);
        const conversation = await consultationService.updateSummary({
            ...body,
            appointmentId: requiredParam(req.params.appointmentId, 'appointmentId'),
        });

        res.json(conversation);
    }),
);

aiRoutes.post(
    '/consultations/:appointmentId/approve',
    asyncHandler(async (req, res) => {
        const conversation = await consultationService.approveSummary(
            requiredParam(req.params.appointmentId, 'appointmentId'),
        );

        res.json(conversation);
    }),
);

aiRoutes.post(
    '/lab-results/:labOrderId/interpret',
    asyncHandler(async (req, res) => {
        const body = labInterpretationSchema.parse(req.body);
        const interpretation = await labInterpretationService.interpret({
            ...body,
            labOrderId: requiredParam(req.params.labOrderId, 'labOrderId'),
        });

        res.status(201).json(interpretation);
    }),
);

aiRoutes.post(
    '/internal/lab-results/:labOrderId/interpret',
    requireInternalApiKey,
    asyncHandler(async (req, res) => {
        const body = labInterpretationSchema.parse(req.body);
        const labOrderId = requiredParam(req.params.labOrderId, 'labOrderId');

        setImmediate(() => {
            void labInterpretationService
                .interpret({
                    ...body,
                    labOrderId,
                })
                .catch((error: unknown) => {
                    console.error(
                        'Background lab interpretation failed',
                        labOrderId,
                        error,
                    );
                });
        });

        res.status(202).json({
            labOrderId,
            status: 'queued',
        });
    }),
);

aiRoutes.get(
    '/lab-results/:labOrderId/interpretation',
    asyncHandler(async (req, res) => {
        const interpretation = await labInterpretationService.getPatientVersionByLabOrderId(
            requiredParam(req.params.labOrderId, 'labOrderId'),
        );

        res.json(interpretation);
    }),
);

aiRoutes.post(
    '/agent/message',
    asyncHandler(async (req, res) => {
        const body = reservationMessageSchema.parse(req.body);
        const result = await reservationAgentService.sendMessage(body);

        res.json(result);
    }),
);

aiRoutes.post(
    '/vapi/tools',
    asyncHandler(async (req, res) => {
        await vapiToolsController.handle(req, res);
    }),
);

aiRoutes.get(
    '/vapi/calls',
    requireAdminAccess,
    asyncHandler(async (req, res) => {
        const query = vapiCallsQuerySchema.parse(req.query);
        const result = await vapiCallLogService.listCalls(query);

        res.json(result);
    }),
);

aiRoutes.get(
    '/vapi/calls/:id',
    requireAdminAccess,
    asyncHandler(async (req, res) => {
        const result = await vapiCallLogService.getCall(
            requiredParam(req.params.id, 'id'),
        );

        res.json(result);
    }),
);

aiRoutes.get(
    '/vapi/calls/:id/log',
    requireAdminAccess,
    asyncHandler(async (req, res) => {
        const result = await vapiCallLogService.getArtifactLog(
            requiredParam(req.params.id, 'id'),
        );

        res.json(result);
    }),
);

function requiredParam(value: string | string[] | undefined, name: string) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new AppError(`${name} route parameter is required`, 400);
    }

    return value;
}

function absoluteUrl(req: Request, path: string) {
    if (env.publicBaseUrl) {
        return new URL(path, env.publicBaseUrl).toString();
    }

    const host = req.get('host') ?? `localhost:${env.port}`;

    return `${req.protocol}://${host}${path}`;
}

function requireAdminAccess(req: Request, _res: Response, next: NextFunction) {
    if (!env.jwtAccessSecret) {
        throw new AppError('JWT access secret is not configured', 503);
    }

    const token = bearerToken(req);

    if (!token) {
        throw new AppError('Authentication is required', 401);
    }

    const decoded = jwt.verify(token, env.jwtAccessSecret) as jwt.JwtPayload & {
        roles?: string[];
        permissions?: string[];
    };
    const roles = decoded.roles ?? [];
    const permissions = decoded.permissions ?? [];
    const canRead =
        roles.includes('Admin') ||
        roles.includes('Super Admin') ||
        permissions.includes('audit_logs:read');

    if (!canRead) {
        throw new AppError('Admin access is required', 403);
    }

    next();
}

function bearerToken(req: Request) {
    const header = req.get('authorization');
    const match = /^Bearer\s+(.+)$/i.exec(header ?? '');

    return match?.[1];
}
