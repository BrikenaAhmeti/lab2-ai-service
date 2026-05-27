import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { createAiProvider } from '../../../infrastructure/ai/ai-provider';
import { env } from '../../../config/env';
import { AppError } from '../../../shared/core/errors/app-error';
import { asyncHandler } from '../../../shared/http/async-handler';
import { ConsultationAiService } from '../services/consultation-ai.service';
import { LabInterpretationAiService } from '../services/lab-interpretation-ai.service';
import { ReservationAgentService } from '../services/reservation-agent.service';

const aiProvider = createAiProvider();
const consultationService = new ConsultationAiService(aiProvider);
const labInterpretationService = new LabInterpretationAiService(aiProvider);
const reservationAgentService = new ReservationAgentService(aiProvider);

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
});

const summarizeSchema = z.object({
    appointmentId: z.string().min(1),
    patientId: z.string().min(1).optional(),
    staffId: z.string().min(1).optional(),
    transcription: z.string().min(1),
    context: z.record(z.string(), z.unknown()).optional(),
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
                    'POST /api/ai/consultations/:appointmentId/approve',
                ],
            },
            {
                id: 'MS-34',
                name: 'Lab result interpretation',
                endpoints: [
                    'POST /api/ai/lab-results/:labOrderId/interpret',
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
        const result = await consultationService.transcribe({
            ...metadata,
            file: {
                buffer: req.file.buffer,
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
            },
        });

        res.json(result);
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

function requiredParam(value: string | string[] | undefined, name: string) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new AppError(`${name} route parameter is required`, 400);
    }

    return value;
}
