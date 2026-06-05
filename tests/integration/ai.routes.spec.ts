import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { CoreVapiToolsClient } from '../../src/modules/ai/infrastructure/core-vapi-tools.client';

describe('AI service routes', () => {
    const app = createApp();

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function adminToken() {
        return jwt.sign(
            {
                sub: 'admin-user',
                roles: ['Admin'],
                permissions: ['audit_logs:read'],
            },
            env.jwtAccessSecret,
        );
    }

    it('returns AI service health', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            status: 'ok',
            service: 'medsphere-ai-service',
        });
    });

    it('describes the AI service capabilities from the sprint scope', async () => {
        const response = await request(app).get('/api/ai/capabilities');

        expect(response.status).toBe(200);
        expect(response.body.storage).toBe('mongodb');
        expect(response.body.features.map((feature: { id: string }) => feature.id)).toEqual([
            'MS-33',
            'MS-34',
            'MS-55',
            'MS-35',
            'MS-56',
            'MS-VAPI-APPOINTMENTS',
        ]);
    });

    it('serves OpenAPI documentation for the AI service', async () => {
        const uiResponse = await request(app).get('/api/docs/');
        const specResponse = await request(app).get('/api/docs.json');

        expect(uiResponse.status).toBe(200);
        expect(uiResponse.text).toContain('swagger-ui');
        expect(specResponse.status).toBe(200);
        expect(specResponse.body.openapi).toBe('3.0.3');
        expect(specResponse.body.paths).toHaveProperty('/api/ai/transcribe');
        expect(specResponse.body.paths).toHaveProperty('/api/ai/summarize');
        expect(specResponse.body.components.securitySchemes).toHaveProperty(
            'bearerAuth',
        );
        expect(
            specResponse.body.tags.map((tag: { name: string }) => tag.name),
        ).toContain('Dashboard Helper Socket');
        expect(specResponse.body['x-socket-events']).toMatchObject({
            dashboardHelper: {
                namespace: '/',
                clientEvents: {
                    'dashboard-helper:message': {
                        payload: {
                            $ref: '#/components/schemas/DashboardHelperMessageRequest',
                        },
                    },
                },
                serverEvents: {
                    'dashboard-helper:typing': {
                        payload: {
                            $ref: '#/components/schemas/DashboardHelperTypingEvent',
                        },
                    },
                    'dashboard-helper:message': {
                        payload: {
                            $ref: '#/components/schemas/DashboardHelperAssistantMessageEvent',
                        },
                    },
                },
            },
        });
        expect(specResponse.body.components.schemas).toHaveProperty(
            'DashboardHelperMessageRequest',
        );
        expect(specResponse.body.components.schemas.AiFeature.required).toEqual([
            'id',
            'name',
        ]);
    });

    it('validates summarize requests before invoking persistence', async () => {
        const response = await request(app).post('/api/ai/summarize').send({});

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Validation failed');
    });

    it('executes a direct Vapi tool request through the core service client', async () => {
        const executeSpy = jest
            .spyOn(CoreVapiToolsClient.prototype, 'executeTool')
            .mockResolvedValue({
                success: true,
                needsClarification: false,
                resolved: {
                    doctorId: '42b2c8e0-4df7-4df1-b951-fb96b0b8cf86',
                    doctorName: 'Dr. Arben Krasniqi',
                },
                message: 'Appointment context resolved successfully.',
            });

        const response = await request(app)
            .post('/api/ai/vapi/tools')
            .send({
                toolName: 'resolveAppointmentContext',
                arguments: {
                    doctorName: 'Arben Krasniqi',
                },
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.resolved.doctorName).toBe('Dr. Arben Krasniqi');
        expect(executeSpy).toHaveBeenCalledWith('resolveAppointmentContext', {
            doctorName: 'Arben Krasniqi',
        });
    });

    it('passes spoken patient email text through to core for normalization', async () => {
        const executeSpy = jest
            .spyOn(CoreVapiToolsClient.prototype, 'executeTool')
            .mockResolvedValue({
                success: false,
                message: 'This time is no longer available. Please choose another time.',
            });

        const response = await request(app)
            .post('/api/ai/vapi/tools')
            .send({
                toolName: 'bookAppointment',
                arguments: {
                    doctorName: 'Arben Krasniqi',
                    serviceName: 'General Consultation',
                    startTime: '2030-01-02T09:00:00+01:00',
                    personalNumber: '1234567890',
                    patientFirstName: 'Ariana',
                    patientLastName: 'Berisha',
                    patientEmail: 'Ariana at Example dot COM',
                },
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(executeSpy).toHaveBeenCalledWith('bookAppointment', expect.objectContaining({
            patientEmail: 'Ariana at Example dot COM',
        }));
    });

    it('returns Vapi tool-call results with matching toolCallId', async () => {
        jest.spyOn(CoreVapiToolsClient.prototype, 'executeTool').mockResolvedValue({
            success: true,
            available: true,
            message: 'I found available times.',
            slots: [{ label: '09:00' }],
        });

        const response = await request(app)
            .post('/api/ai/vapi/tools')
            .send({
                message: {
                    type: 'tool-calls',
                    toolCallList: [
                        {
                            id: 'call_123',
                            name: 'checkAvailability',
                            arguments: {
                                doctorName: 'Arben Krasniqi',
                                serviceName: 'General Consultation',
                                date: '2030-01-02',
                            },
                        },
                    ],
                },
            });

        expect(response.status).toBe(200);
        expect(response.body.results).toHaveLength(1);
        expect(response.body.results[0].toolCallId).toBe('call_123');
        expect(JSON.parse(response.body.results[0].result)).toMatchObject({
            success: true,
            available: true,
            slots: [{ label: '09:00' }],
        });
    });

    it('lists Vapi call logs and recording URLs for admins', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify([
                    {
                        id: 'call_123',
                        type: 'webCall',
                        status: 'ended',
                        assistantId: 'bf4264e4-5acd-43b8-827f-ea10a81baf2a',
                        createdAt: '2030-01-02T09:00:00Z',
                        startedAt: '2030-01-02T09:00:10Z',
                        endedAt: '2030-01-02T09:03:10Z',
                        artifact: {
                            transcript: 'Assistant: Hello\nUser: I need an appointment',
                            logUrl: 'https://api.vapi.ai/logs/call_123.json',
                            recording: {
                                stereoUrl: 'https://api.vapi.ai/recordings/call_123.wav',
                                mono: {
                                    combinedUrl: 'https://api.vapi.ai/recordings/call_123_mono.wav',
                                },
                            },
                            messages: [
                                { role: 'assistant', message: 'Hello', secondsFromStart: 0 },
                                { role: 'user', message: 'I need an appointment', secondsFromStart: 2 },
                            ],
                        },
                        analysis: { summary: 'Appointment booking call.' },
                    },
                ]),
                { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        );

        const response = await request(app)
            .get('/api/ai/vapi/calls?limit=10')
            .set('Authorization', `Bearer ${adminToken()}`);

        expect(response.status).toBe(200);
        expect(response.body.calls).toHaveLength(1);
        expect(response.body.calls[0]).toMatchObject({
            id: 'call_123',
            summary: 'Appointment booking call.',
            logUrl: 'https://api.vapi.ai/logs/call_123.json',
            recordingUrls: {
                stereoUrl: 'https://api.vapi.ai/recordings/call_123.wav',
                monoCombinedUrl: 'https://api.vapi.ai/recordings/call_123_mono.wav',
            },
            messages: [
                { role: 'assistant', message: 'Hello' },
                { role: 'user', message: 'I need an appointment' },
            ],
        });
    });

    it('fetches the full Vapi artifact log for admins', async () => {
        jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        id: 'call_123',
                        assistantId: 'bf4264e4-5acd-43b8-827f-ea10a81baf2a',
                        artifact: {
                            logUrl: 'https://api.vapi.ai/logs/call_123.json',
                        },
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ events: [{ type: 'tool-call', toolName: 'checkAvailability' }] }),
                    { status: 200, headers: { 'content-type': 'application/json' } },
                ),
            );

        const response = await request(app)
            .get('/api/ai/vapi/calls/call_123/log')
            .set('Authorization', `Bearer ${adminToken()}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            callId: 'call_123',
            logUrl: 'https://api.vapi.ai/logs/call_123.json',
            body: {
                events: [{ type: 'tool-call', toolName: 'checkAvailability' }],
            },
        });
    });
});
