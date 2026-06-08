import type { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const openApiDefinition = {
    openapi: '3.0.3',
    info: {
        title: 'MedSphere AI Service API',
        version: '1.0.0',
        description:
            'OpenAPI documentation for the MedSphere AI microservice, covering consultation transcription and summarization, lab interpretation, reservation-agent workflows, and the dashboard-helper Socket.IO chat contract.',
    },
    servers: [
        {
            url: 'http://localhost:3010',
            description: 'Local AI service',
        },
    ],
    tags: [
        {
            name: 'Health',
            description: 'Service health and readiness checks.',
        },
        {
            name: 'Capabilities',
            description: 'AI feature discovery for the MedSphere platform.',
        },
        {
            name: 'Consultation AI',
            description: 'Audio transcription and consultation summarization.',
        },
        {
            name: 'Lab AI',
            description: 'Clinical and patient-facing lab result interpretation.',
        },
        {
            name: 'Reservation Agent',
            description: 'Conversation endpoint for appointment booking assistance.',
        },
        {
            name: 'Dashboard Helper Socket',
            description:
                'Socket.IO chat widget contract for authenticated role-aware dashboard help. Answers are limited to the MedSphere role portal knowledge base. Connect to the AI service origin with auth.token set to the bearer access token.',
        },
    ],
    'x-socket-events': {
        dashboardHelper: {
            transport: 'Socket.IO',
            namespace: '/',
            url: 'http://localhost:3010',
            authentication: {
                type: 'bearer',
                location: 'handshake.auth.token',
                fallbackHeader: 'Authorization: Bearer <token>',
            },
            clientEvents: {
                'dashboard-helper:message': {
                    description:
                        'Frontend sends a dashboard-helper question. The frontend must include the current role returned from auth/frontend state on every message.',
                    payload: {
                        $ref: '#/components/schemas/DashboardHelperMessageRequest',
                    },
                    acknowledgement: {
                        $ref: '#/components/schemas/DashboardHelperAcknowledgement',
                    },
                },
            },
            serverEvents: {
                'dashboard-helper:ready': {
                    description:
                        'Emitted after the socket authenticates and joins the user room.',
                    payload: {
                        $ref: '#/components/schemas/DashboardHelperReadyEvent',
                    },
                },
                'dashboard-helper:typing': {
                    description:
                        'Emitted with isTyping=true while the AI service is generating and false when generation completes.',
                    payload: {
                        $ref: '#/components/schemas/DashboardHelperTypingEvent',
                    },
                },
                'dashboard-helper:message': {
                    description:
                        'Assistant answer for current-role dashboard workflow questions. Unknown KB topics return a support/contact fallback instead of inventing.',
                    payload: {
                        $ref: '#/components/schemas/DashboardHelperAssistantMessageEvent',
                    },
                },
                'dashboard-helper:error': {
                    description:
                        'Emitted when validation, authentication, role mismatch, or provider handling fails.',
                    payload: {
                        $ref: '#/components/schemas/DashboardHelperErrorEvent',
                    },
                },
            },
        },
    },
    paths: {
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Check AI service health',
                operationId: 'getHealth',
                security: [],
                responses: {
                    '200': {
                        description: 'The service is reachable.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/HealthResponse',
                                },
                                example: {
                                    status: 'ok',
                                    service: 'medsphere-ai-service',
                                    mongo: {
                                        connected: true,
                                        readyState: 1,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/api/ai/capabilities': {
            get: {
                tags: ['Capabilities'],
                summary: 'List AI service capabilities',
                operationId: 'getAiCapabilities',
                security: [],
                responses: {
                    '200': {
                        description: 'AI feature list and provider mode.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/CapabilitiesResponse',
                                },
                            },
                        },
                    },
                },
            },
        },
        '/api/ai/transcribe': {
            post: {
                tags: ['Consultation AI'],
                summary: 'Transcribe consultation audio',
                operationId: 'transcribeConsultationAudio',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: ['audio'],
                                properties: {
                                    audio: {
                                        type: 'string',
                                        format: 'binary',
                                        description:
                                            'Audio upload in any MIME type beginning with audio/.',
                                    },
                                    appointmentId: {
                                        type: 'string',
                                        example: 'apt-123',
                                    },
                                    patientId: {
                                        type: 'string',
                                        example: 'patient-123',
                                    },
                                    staffId: {
                                        type: 'string',
                                        example: 'staff-123',
                                    },
                                    audioFileUrl: {
                                        type: 'string',
                                        format: 'uri',
                                        example:
                                            'https://files.medsphere.local/audio/apt-123.webm',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description:
                            'Generated transcription. If appointmentId is provided, the transcription is also stored in MongoDB.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/TranscriptionResponse',
                                },
                                example: {
                                    text: 'Stub transcription generated for consultation.webm.',
                                    model: 'stub-transcription',
                                },
                            },
                        },
                    },
                    '400': { $ref: '#/components/responses/BadRequest' },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '403': { $ref: '#/components/responses/Forbidden' },
                    '502': { $ref: '#/components/responses/AiProviderFailure' },
                    '503': { $ref: '#/components/responses/AiProviderUnavailable' },
                },
            },
        },
        '/api/ai/summarize': {
            post: {
                tags: ['Consultation AI'],
                summary: 'Create a structured consultation summary',
                operationId: 'summarizeConsultation',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/SummarizeRequest',
                            },
                            example: {
                                appointmentId: 'apt-123',
                                patientId: 'patient-123',
                                staffId: 'staff-123',
                                transcription:
                                    'Patient reports persistent cough and fever for three days.',
                                context: {
                                    department: 'General Medicine',
                                    visitType: 'follow-up',
                                },
                            },
                        },
                    },
                },
                responses: {
                    '201': {
                        description:
                            'Structured summary saved as a draft AI conversation.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/SummaryResponse',
                                },
                            },
                        },
                    },
                    '400': { $ref: '#/components/responses/BadRequest' },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '403': { $ref: '#/components/responses/Forbidden' },
                    '502': { $ref: '#/components/responses/AiProviderFailure' },
                    '503': { $ref: '#/components/responses/AiProviderUnavailable' },
                },
            },
        },
        '/api/ai/consultations/{appointmentId}': {
            get: {
                tags: ['Consultation AI'],
                summary: 'Get a stored AI consultation conversation',
                operationId: 'getAiConsultation',
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        $ref: '#/components/parameters/AppointmentId',
                    },
                ],
                responses: {
                    '200': {
                        description: 'Stored transcription and summary data.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/AiConversation',
                                },
                            },
                        },
                    },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '403': { $ref: '#/components/responses/Forbidden' },
                    '404': { $ref: '#/components/responses/NotFound' },
                },
            },
        },
        '/api/ai/consultations/{appointmentId}/summary': {
            put: {
                tags: ['Consultation AI'],
                summary: 'Save an edited AI consultation report',
                operationId: 'updateAiConsultationSummary',
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        $ref: '#/components/parameters/AppointmentId',
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/UpdateConsultationSummaryRequest',
                            },
                            example: {
                                reportText:
                                    'Chief complaint\nChest discomfort\n\nAssessment and diagnosis\nStable exam',
                                summaryStatus: 'draft',
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description:
                            'AI consultation report text was saved for the appointment.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/AiConversation',
                                },
                            },
                        },
                    },
                    '400': { $ref: '#/components/responses/BadRequest' },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '403': { $ref: '#/components/responses/Forbidden' },
                    '404': { $ref: '#/components/responses/NotFound' },
                },
            },
        },
        '/api/ai/consultations/{appointmentId}/approve': {
            post: {
                tags: ['Consultation AI'],
                summary: 'Approve an AI-generated consultation summary',
                operationId: 'approveAiConsultationSummary',
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        $ref: '#/components/parameters/AppointmentId',
                    },
                ],
                responses: {
                    '200': {
                        description:
                            'AI consultation summary marked as approved.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/AiConversation',
                                },
                            },
                        },
                    },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '403': { $ref: '#/components/responses/Forbidden' },
                    '404': { $ref: '#/components/responses/NotFound' },
                    '409': { $ref: '#/components/responses/Conflict' },
                },
            },
        },
        '/api/ai/lab-results/{labOrderId}/interpret': {
            post: {
                tags: ['Lab AI'],
                summary: 'Generate lab result interpretation',
                operationId: 'interpretLabResults',
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        $ref: '#/components/parameters/LabOrderId',
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/LabInterpretationRequest',
                            },
                            example: {
                                patientId: 'patient-123',
                                results: [
                                    {
                                        name: 'Glucose',
                                        value: 180,
                                        unit: 'mg/dL',
                                        referenceRange: '70-99 mg/dL',
                                        flag: 'high',
                                    },
                                ],
                                patientContext: {
                                    age: 46,
                                    gender: 'female',
                                    knownConditions: ['Type 2 diabetes'],
                                },
                            },
                        },
                    },
                },
                responses: {
                    '201': {
                        description:
                            'Clinical and patient-facing interpretations saved in MongoDB.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/AiLabInterpretation',
                                },
                            },
                        },
                    },
                    '400': { $ref: '#/components/responses/BadRequest' },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '403': { $ref: '#/components/responses/Forbidden' },
                    '404': { $ref: '#/components/responses/NotFound' },
                    '409': { $ref: '#/components/responses/Conflict' },
                    '502': { $ref: '#/components/responses/AiProviderFailure' },
                    '503': { $ref: '#/components/responses/AiProviderUnavailable' },
                },
            },
        },
        '/api/ai/internal/lab-results/{labOrderId}/interpret': {
            post: {
                tags: ['Lab AI'],
                summary: 'Queue lab result interpretation from Core Service',
                operationId: 'queueLabResultsInterpretation',
                security: [{ internalApiKey: [] }],
                parameters: [
                    {
                        $ref: '#/components/parameters/LabOrderId',
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/LabInterpretationRequest',
                            },
                        },
                    },
                },
                responses: {
                    '202': {
                        description:
                            'Interpretation job accepted and will be generated in the background.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/QueuedLabInterpretationResponse',
                                },
                                example: {
                                    labOrderId: 'lab-123',
                                    status: 'queued',
                                },
                            },
                        },
                    },
                    '400': { $ref: '#/components/responses/BadRequest' },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '503': { $ref: '#/components/responses/AiProviderUnavailable' },
                },
            },
        },
        '/api/ai/lab-results/{labOrderId}/interpretation': {
            get: {
                tags: ['Lab AI'],
                summary: 'Get patient-facing lab interpretation',
                operationId: 'getPatientLabInterpretation',
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        $ref: '#/components/parameters/LabOrderId',
                    },
                ],
                responses: {
                    '200': {
                        description:
                            'Patient-safe interpretation response for the portal.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/PatientLabInterpretationResponse',
                                },
                                example: {
                                    labOrderId: 'lab-123',
                                    patientVersion:
                                        'Some lab values were marked outside the provided reference range: Glucose is above the provided reference range (180 mg/dL; reference range: 70-99 mg/dL). This does not diagnose a condition. Please review the full result with your doctor or ordering clinician.',
                                    disclaimer:
                                        'AI-generated range explanation only - not a diagnosis. Review the full result with your doctor or ordering clinician.',
                                    recommendations: [
                                        'Review the full lab report with the ordering clinician.',
                                    ],
                                    riskFlags: [
                                        'Glucose - moderate (180 mg/dL): Above the provided reference range: 70-99 mg/dL',
                                    ],
                                },
                            },
                        },
                    },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '403': { $ref: '#/components/responses/Forbidden' },
                    '404': { $ref: '#/components/responses/NotFound' },
                },
            },
        },
        '/api/ai/agent/message': {
            post: {
                tags: ['Reservation Agent'],
                summary: 'Send a reservation-agent message',
                operationId: 'sendReservationAgentMessage',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ReservationMessageRequest',
                            },
                            example: {
                                sessionId: 'session-123',
                                message:
                                    'I need to book an appointment with cardiology next week.',
                                userId: 'user-123',
                                patientId: 'patient-123',
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description:
                            'Agent reply plus updated reservation session state.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ReservationAgentResponse',
                                },
                            },
                        },
                    },
                    '400': { $ref: '#/components/responses/BadRequest' },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '403': { $ref: '#/components/responses/Forbidden' },
                    '409': { $ref: '#/components/responses/Conflict' },
                    '502': { $ref: '#/components/responses/AiProviderFailure' },
                    '503': { $ref: '#/components/responses/AiProviderUnavailable' },
                },
            },
        },
    },
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description:
                    'JWT access token passed by the frontend or API gateway.',
            },
            internalApiKey: {
                type: 'apiKey',
                in: 'header',
                name: 'x-internal-api-key',
                description:
                    'Shared service-to-service key for Core Service background handoffs.',
            },
        },
        parameters: {
            AppointmentId: {
                name: 'appointmentId',
                in: 'path',
                required: true,
                schema: {
                    type: 'string',
                    minLength: 1,
                },
                example: 'apt-123',
            },
            LabOrderId: {
                name: 'labOrderId',
                in: 'path',
                required: true,
                schema: {
                    type: 'string',
                    minLength: 1,
                },
                example: 'lab-123',
            },
        },
        responses: {
            BadRequest: {
                description: 'The request body, parameters, or uploaded file are invalid.',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ErrorResponse',
                        },
                        examples: {
                            validationFailed: {
                                value: {
                                    message: 'Validation failed',
                                    issues: [
                                        {
                                            code: 'invalid_type',
                                            path: ['appointmentId'],
                                            message:
                                                'Invalid input: expected string, received undefined',
                                        },
                                    ],
                                },
                            },
                            invalidUpload: {
                                value: {
                                    message: 'Only audio uploads are supported',
                                },
                            },
                        },
                    },
                },
            },
            Unauthorized: {
                description: 'A bearer token is missing or invalid.',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ErrorResponse',
                        },
                        example: {
                            message: 'Unauthorized',
                        },
                    },
                },
            },
            Forbidden: {
                description: 'The authenticated user does not have permission.',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ErrorResponse',
                        },
                        example: {
                            message: 'Forbidden',
                        },
                    },
                },
            },
            NotFound: {
                description: 'The requested AI resource does not exist.',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ErrorResponse',
                        },
                        example: {
                            message: 'AI consultation conversation not found',
                        },
                    },
                },
            },
            Conflict: {
                description:
                    'The requested state change conflicts with the current resource state.',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ErrorResponse',
                        },
                        example: {
                            message: 'Requested appointment slot is no longer available',
                        },
                    },
                },
            },
            AiProviderFailure: {
                description:
                    'The configured AI provider failed or returned an unusable response.',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ErrorResponse',
                        },
                        example: {
                            message: 'OpenAI summary response was not valid JSON',
                        },
                    },
                },
            },
            AiProviderUnavailable: {
                description:
                    'AI provider configuration is missing or unavailable.',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ErrorResponse',
                        },
                        example: {
                            message:
                                'OPENAI_API_KEY is required when AI_PROVIDER_MODE=openai',
                        },
                    },
                },
            },
        },
        schemas: {
            HealthResponse: {
                type: 'object',
                required: ['status', 'service', 'mongo'],
                properties: {
                    status: {
                        type: 'string',
                        example: 'ok',
                    },
                    service: {
                        type: 'string',
                        example: 'medsphere-ai-service',
                    },
                    mongo: {
                        type: 'object',
                        additionalProperties: true,
                        example: {
                            connected: true,
                            readyState: 1,
                        },
                    },
                },
            },
            CapabilitiesResponse: {
                type: 'object',
                required: ['service', 'providerMode', 'storage', 'features'],
                properties: {
                    service: {
                        type: 'string',
                        example: 'medsphere-ai-service',
                    },
                    providerMode: {
                        type: 'string',
                        enum: ['stub', 'openai'],
                        example: 'stub',
                    },
                    storage: {
                        type: 'string',
                        example: 'mongodb',
                    },
                    features: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/AiFeature',
                        },
                    },
                },
            },
            AiFeature: {
                type: 'object',
                required: ['id', 'name'],
                properties: {
                    id: {
                        type: 'string',
                        example: 'MS-33',
                    },
                    name: {
                        type: 'string',
                        example:
                            'Audio transcription and consultation summarization',
                    },
                    endpoints: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        example: [
                            'POST /api/ai/transcribe',
                            'POST /api/ai/summarize',
                        ],
                    },
                    sockets: {
                        $ref: '#/components/schemas/SocketFeature',
                    },
                    responseShape: {
                        type: 'object',
                        additionalProperties: true,
                    },
                },
            },
            SocketFeature: {
                type: 'object',
                required: ['namespace', 'clientEvents', 'serverEvents'],
                properties: {
                    namespace: {
                        type: 'string',
                        example: '/',
                    },
                    clientEvents: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        example: ['dashboard-helper:message'],
                    },
                    serverEvents: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        example: [
                            'dashboard-helper:ready',
                            'dashboard-helper:typing',
                            'dashboard-helper:message',
                            'dashboard-helper:error',
                        ],
                    },
                },
            },
            TokenUsage: {
                type: 'object',
                properties: {
                    promptTokens: {
                        type: 'integer',
                        minimum: 0,
                        example: 450,
                    },
                    completionTokens: {
                        type: 'integer',
                        minimum: 0,
                        example: 180,
                    },
                    totalTokens: {
                        type: 'integer',
                        minimum: 0,
                        example: 630,
                    },
                },
            },
            TranscriptionResponse: {
                type: 'object',
                required: ['text', 'model'],
                properties: {
                    text: {
                        type: 'string',
                        example:
                            'Patient reports persistent cough and fever for three days.',
                    },
                    model: {
                        type: 'string',
                        example: 'whisper-1',
                    },
                    audioFileUrl: {
                        type: 'string',
                        format: 'uri',
                        example:
                            'http://localhost:3010/uploads/consultation-audio/apt-123.webm',
                    },
                    conversationTurns: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/ConsultationConversationTurn',
                        },
                    },
                    tokenUsage: {
                        $ref: '#/components/schemas/TokenUsage',
                    },
                },
            },
            ConsultationConversationTurn: {
                type: 'object',
                required: ['speaker', 'text'],
                properties: {
                    speaker: {
                        type: 'string',
                        enum: ['doctor', 'patient', 'unknown'],
                        example: 'patient',
                    },
                    text: {
                        type: 'string',
                        example: 'I have had a sore throat for three days.',
                    },
                },
            },
            SummarizeRequest: {
                type: 'object',
                required: ['appointmentId', 'transcription'],
                properties: {
                    appointmentId: {
                        type: 'string',
                        minLength: 1,
                        example: 'apt-123',
                    },
                    patientId: {
                        type: 'string',
                        minLength: 1,
                        example: 'patient-123',
                    },
                    staffId: {
                        type: 'string',
                        minLength: 1,
                        example: 'staff-123',
                    },
                    transcription: {
                        type: 'string',
                        minLength: 1,
                        example:
                            'Patient reports persistent cough and fever for three days.',
                    },
                    context: {
                        type: 'object',
                        additionalProperties: true,
                        example: {
                            department: 'General Medicine',
                            visitType: 'follow-up',
                        },
                    },
                },
            },
            ConsultationSummary: {
                type: 'object',
                required: [
                    'chiefComplaint',
                    'historyOfPresentIllness',
                    'examinationFindings',
                    'assessmentAndDiagnosis',
                    'treatmentPlan',
                    'followUpInstructions',
                ],
                properties: {
                    chiefComplaint: {
                        type: 'string',
                        example: 'Persistent cough and fever',
                    },
                    historyOfPresentIllness: {
                        type: 'string',
                        example:
                            'Symptoms started three days ago and have not improved.',
                    },
                    examinationFindings: {
                        type: 'string',
                        example: 'Pending doctor review',
                    },
                    assessmentAndDiagnosis: {
                        type: 'string',
                        example: 'Pending doctor review',
                    },
                    treatmentPlan: {
                        type: 'string',
                        example: 'Pending doctor review',
                    },
                    followUpInstructions: {
                        type: 'string',
                        example: 'Pending doctor review',
                    },
                    aiReview: {
                        type: 'string',
                        example:
                            'Verify fever duration, hydration status, medication allergies, and red flags before finalizing.',
                    },
                },
            },
            UpdateConsultationSummaryRequest: {
                type: 'object',
                properties: {
                    reportText: {
                        type: 'string',
                        minLength: 1,
                        example:
                            'Patient concern\nChest discomfort\n\nTreatment plan\nContinue monitoring\n\nAI review\nVerify red flags before finalizing.',
                    },
                    summary: {
                        $ref: '#/components/schemas/ConsultationSummary',
                    },
                    summaryStatus: {
                        type: 'string',
                        enum: ['draft', 'approved', 'discarded'],
                        example: 'draft',
                    },
                },
            },
            AiConversation: {
                type: 'object',
                required: ['appointmentId', 'summaryStatus'],
                properties: {
                    _id: {
                        type: 'string',
                        example: '665f0f7a7a8f7a0012c3d456',
                    },
                    appointmentId: {
                        type: 'string',
                        example: 'apt-123',
                    },
                    patientId: {
                        type: 'string',
                        example: 'patient-123',
                    },
                    staffId: {
                        type: 'string',
                        example: 'staff-123',
                    },
                    audioFileUrl: {
                        type: 'string',
                        format: 'uri',
                        example:
                            'https://files.medsphere.local/audio/apt-123.webm',
                    },
                    audioOriginalName: {
                        type: 'string',
                        example: 'consultation.webm',
                    },
                    audioMimeType: {
                        type: 'string',
                        example: 'audio/webm',
                    },
                    audioSizeBytes: {
                        type: 'integer',
                        minimum: 0,
                        example: 481024,
                    },
                    transcription: {
                        type: 'string',
                        example:
                            'Patient reports persistent cough and fever for three days.',
                    },
                    conversationTurns: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/ConsultationConversationTurn',
                        },
                    },
                    summary: {
                        $ref: '#/components/schemas/ConsultationSummary',
                    },
                    reportText: {
                        type: 'string',
                        example:
                            'Patient concern\nPersistent cough and fever\n\nTreatment plan\nPending doctor review\n\nAI review\nVerify red flags before finalizing.',
                    },
                    summaryStatus: {
                        type: 'string',
                        enum: ['draft', 'approved', 'discarded'],
                        example: 'draft',
                    },
                    keywords: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    models: {
                        type: 'object',
                        properties: {
                            transcription: {
                                type: 'string',
                                example: 'whisper-1',
                            },
                            summary: {
                                type: 'string',
                                example: 'gpt-4o',
                            },
                        },
                    },
                    tokenUsage: {
                        $ref: '#/components/schemas/TokenUsage',
                    },
                    approvedAt: {
                        type: 'string',
                        format: 'date-time',
                    },
                    createdAt: {
                        type: 'string',
                        format: 'date-time',
                    },
                    updatedAt: {
                        type: 'string',
                        format: 'date-time',
                    },
                },
            },
            SummaryResponse: {
                type: 'object',
                required: ['summary', 'conversation'],
                properties: {
                    summary: {
                        $ref: '#/components/schemas/ConsultationSummary',
                    },
                    reportText: {
                        type: 'string',
                        example:
                            'Chief complaint\nPersistent cough and fever\n\nTreatment plan\nPending doctor review',
                    },
                    conversation: {
                        $ref: '#/components/schemas/AiConversation',
                    },
                },
            },
            LabResultItem: {
                type: 'object',
                required: ['name', 'value'],
                properties: {
                    name: {
                        type: 'string',
                        minLength: 1,
                        example: 'Glucose',
                    },
                    value: {
                        oneOf: [{ type: 'string' }, { type: 'number' }],
                        example: 180,
                    },
                    unit: {
                        type: 'string',
                        example: 'mg/dL',
                    },
                    referenceRange: {
                        type: 'string',
                        example: '70-99 mg/dL',
                    },
                    flag: {
                        type: 'string',
                        enum: ['low', 'normal', 'high', 'critical'],
                        example: 'high',
                    },
                },
            },
            PatientContext: {
                type: 'object',
                properties: {
                    age: {
                        type: 'integer',
                        minimum: 1,
                        example: 46,
                    },
                    gender: {
                        type: 'string',
                        example: 'female',
                    },
                    knownConditions: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        example: ['Type 2 diabetes'],
                    },
                },
            },
            LabInterpretationRequest: {
                type: 'object',
                required: ['results'],
                properties: {
                    patientId: {
                        type: 'string',
                        minLength: 1,
                        example: 'patient-123',
                    },
                    results: {
                        type: 'array',
                        minItems: 1,
                        items: {
                            $ref: '#/components/schemas/LabResultItem',
                        },
                    },
                    patientContext: {
                        $ref: '#/components/schemas/PatientContext',
                    },
                },
            },
            RiskFlag: {
                type: 'object',
                required: ['testName', 'severity', 'note'],
                properties: {
                    testName: {
                        type: 'string',
                        example: 'Glucose',
                    },
                    severity: {
                        type: 'string',
                        enum: ['low', 'moderate', 'high', 'critical'],
                        example: 'moderate',
                    },
                    value: {
                        type: 'string',
                        example: '180 mg/dL',
                    },
                    note: {
                        type: 'string',
                        example: 'Above the provided reference range: 70-99 mg/dL',
                    },
                },
            },
            AiLabInterpretation: {
                type: 'object',
                required: [
                    'labOrderId',
                    'clinicalInterpretation',
                    'patientInterpretation',
                    'disclaimer',
                    'riskFlags',
                    'recommendations',
                    'model',
                ],
                properties: {
                    _id: {
                        type: 'string',
                        example: '665f0f7a7a8f7a0012c3d789',
                    },
                    labOrderId: {
                        type: 'string',
                        example: 'lab-123',
                    },
                    patientId: {
                        type: 'string',
                        example: 'patient-123',
                    },
                    clinicalInterpretation: {
                        type: 'string',
                        example:
                            'One or more results are outside the reference range and should be reviewed by the ordering clinician.',
                    },
                    patientInterpretation: {
                        type: 'string',
                        example:
                            'Some lab values were marked outside the provided reference range: Glucose is above the provided reference range (180 mg/dL; reference range: 70-99 mg/dL). This does not diagnose a condition. Please review the full result with your doctor or ordering clinician.',
                    },
                    disclaimer: {
                        type: 'string',
                        example:
                            'AI-generated range explanation only - not a diagnosis. Review the full result with your doctor or ordering clinician.',
                    },
                    riskFlags: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/RiskFlag',
                        },
                    },
                    recommendations: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        example: [
                            'Review the full lab report with the ordering clinician.',
                        ],
                    },
                    model: {
                        type: 'string',
                        example: 'gpt-4o',
                    },
                    tokenUsage: {
                        $ref: '#/components/schemas/TokenUsage',
                    },
                    createdAt: {
                        type: 'string',
                        format: 'date-time',
                    },
                    updatedAt: {
                        type: 'string',
                        format: 'date-time',
                    },
                },
            },
            PatientLabInterpretationResponse: {
                type: 'object',
                required: ['labOrderId', 'patientVersion'],
                properties: {
                    labOrderId: {
                        type: 'string',
                        example: 'lab-123',
                    },
                    patientVersion: {
                        type: 'string',
                        example:
                            'Some lab values were marked outside the provided reference range: Glucose is above the provided reference range (180 mg/dL; reference range: 70-99 mg/dL). This does not diagnose a condition. Please review the full result with your doctor or ordering clinician.',
                    },
                    disclaimer: {
                        type: 'string',
                        example:
                            'AI-generated range explanation only - not a diagnosis. Review the full result with your doctor or ordering clinician.',
                    },
                    recommendations: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    riskFlags: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                },
            },
            QueuedLabInterpretationResponse: {
                type: 'object',
                required: ['labOrderId', 'status'],
                properties: {
                    labOrderId: {
                        type: 'string',
                        example: 'lab-123',
                    },
                    status: {
                        type: 'string',
                        enum: ['queued'],
                        example: 'queued',
                    },
                },
            },
            ReservationMessageRequest: {
                type: 'object',
                required: ['message'],
                properties: {
                    sessionId: {
                        type: 'string',
                        minLength: 1,
                        example: 'session-123',
                    },
                    message: {
                        type: 'string',
                        minLength: 1,
                        example:
                            'I need to book an appointment with cardiology next week.',
                    },
                    userId: {
                        type: 'string',
                        minLength: 1,
                        example: 'user-123',
                    },
                    patientId: {
                        type: 'string',
                        minLength: 1,
                        example: 'patient-123',
                    },
                },
            },
            ReservationMessage: {
                type: 'object',
                required: ['role', 'content'],
                properties: {
                    role: {
                        type: 'string',
                        enum: ['system', 'user', 'assistant', 'tool'],
                        example: 'user',
                    },
                    content: {
                        type: 'string',
                        example:
                            'I need to book an appointment with cardiology next week.',
                    },
                    timestamp: {
                        type: 'string',
                        format: 'date-time',
                    },
                },
            },
            ReservationSession: {
                type: 'object',
                required: ['sessionId', 'messages', 'outcome'],
                properties: {
                    _id: {
                        type: 'string',
                        example: '665f0f7a7a8f7a0012c3d999',
                    },
                    sessionId: {
                        type: 'string',
                        example: 'session-123',
                    },
                    userId: {
                        type: 'string',
                        example: 'user-123',
                    },
                    patientId: {
                        type: 'string',
                        example: 'patient-123',
                    },
                    messages: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/ReservationMessage',
                        },
                    },
                    suggestedDepartment: {
                        type: 'string',
                        example: 'Cardiology',
                    },
                    suggestedStaff: {
                        type: 'string',
                        example: 'staff-456',
                    },
                    outcome: {
                        type: 'string',
                        enum: ['in_progress', 'booked', 'abandoned', 'referred'],
                        example: 'in_progress',
                    },
                    appointmentId: {
                        type: 'string',
                        example: 'apt-456',
                    },
                    model: {
                        type: 'string',
                        example: 'gpt-4o',
                    },
                    tokenUsage: {
                        $ref: '#/components/schemas/TokenUsage',
                    },
                    createdAt: {
                        type: 'string',
                        format: 'date-time',
                    },
                    updatedAt: {
                        type: 'string',
                        format: 'date-time',
                    },
                },
            },
            ReservationAgentResponse: {
                type: 'object',
                required: ['sessionId', 'reply', 'outcome', 'session'],
                properties: {
                    sessionId: {
                        type: 'string',
                        example: 'session-123',
                    },
                    reply: {
                        type: 'string',
                        example:
                            'I can help you book an appointment. Please share the department, preferred date, and whether you have a preferred doctor.',
                    },
                    outcome: {
                        type: 'string',
                        enum: ['in_progress', 'booked', 'abandoned', 'referred'],
                        example: 'in_progress',
                    },
                    appointmentId: {
                        type: 'string',
                        example: 'apt-456',
                    },
                    session: {
                        $ref: '#/components/schemas/ReservationSession',
                    },
                },
            },
            DashboardHelperMessageRequest: {
                type: 'object',
                required: ['message', 'role'],
                properties: {
                    sessionId: {
                        type: 'string',
                        description:
                            'Existing dashboard-helper session id. Omit to start a new session.',
                        example: 'session-123',
                    },
                    message: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 4000,
                        example: 'What should I do first today?',
                    },
                    role: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 80,
                        description:
                            'Current logged-in role from the frontend/auth state. Required on every message.',
                        example: 'Doctor',
                    },
                    portalTitle: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 120,
                        example: 'Doctor Portal',
                    },
                    patientId: {
                        type: 'string',
                        minLength: 1,
                        example: 'patient-123',
                    },
                },
            },
            DashboardHelperAcknowledgement: {
                type: 'object',
                required: ['ok'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true,
                    },
                    sessionId: {
                        type: 'string',
                        example: 'session-123',
                    },
                    error: {
                        type: 'string',
                        example:
                            'Dashboard helper role must match authenticated user role',
                    },
                },
            },
            DashboardHelperReadyEvent: {
                type: 'object',
                required: ['userId', 'roles'],
                properties: {
                    userId: {
                        type: 'string',
                        example: 'user-123',
                    },
                    roles: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        example: ['Doctor'],
                    },
                },
            },
            DashboardHelperTypingEvent: {
                type: 'object',
                required: ['sessionId', 'isTyping'],
                properties: {
                    sessionId: {
                        type: 'string',
                        example: 'session-123',
                    },
                    isTyping: {
                        type: 'boolean',
                        example: true,
                    },
                },
            },
            DashboardHelperAssistantMessageEvent: {
                type: 'object',
                required: ['sessionId', 'role', 'content', 'timestamp'],
                properties: {
                    sessionId: {
                        type: 'string',
                        example: 'session-123',
                    },
                    role: {
                        type: 'string',
                        enum: ['assistant'],
                        example: 'assistant',
                    },
                    content: {
                        type: 'string',
                        example:
                            'Open Doctor Dashboard and start with checked-in or ready consultations.',
                    },
                    model: {
                        type: 'string',
                        example: 'stub-dashboard-helper',
                    },
                    timestamp: {
                        type: 'string',
                        format: 'date-time',
                    },
                },
            },
            DashboardHelperErrorEvent: {
                type: 'object',
                required: ['message'],
                properties: {
                    sessionId: {
                        type: 'string',
                        example: 'session-123',
                    },
                    message: {
                        type: 'string',
                        example: 'Invalid dashboard helper message',
                    },
                },
            },
            ErrorResponse: {
                type: 'object',
                required: ['message'],
                properties: {
                    message: {
                        type: 'string',
                        example: 'Validation failed',
                    },
                    issues: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: true,
                        },
                    },
                },
            },
        },
    },
};

export const swaggerSpec = swaggerJsdoc({
    definition: openApiDefinition,
    apis: [],
});

export function registerSwaggerDocs(app: Express) {
    app.get('/api/docs.json', (_req, res) => {
        res.json(swaggerSpec);
    });

    app.use(
        '/api/docs',
        swaggerUi.serve,
        swaggerUi.setup(swaggerSpec, {
            customSiteTitle: 'MedSphere AI Service API Docs',
            explorer: true,
            swaggerOptions: {
                persistAuthorization: true,
            },
        }),
    );
}
