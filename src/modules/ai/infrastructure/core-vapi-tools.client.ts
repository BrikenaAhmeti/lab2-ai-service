import { env } from '../../../config/env';
import { VapiToolResponse } from '../domain/vapi-tools.types';

export interface VapiToolsClient {
    executeTool(
        toolName: string,
        toolArguments: Record<string, unknown>,
    ): Promise<VapiToolResponse>;
}

export class CoreVapiToolsClient implements VapiToolsClient {
    async executeTool(
        toolName: string,
        toolArguments: Record<string, unknown>,
    ): Promise<VapiToolResponse> {
        try {
            const response = await fetch(
                `${env.coreServiceUrl.replace(/\/$/, '')}/internal/appointments/vapi/tools`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        ...(env.internalApiKey
                            ? { 'x-internal-api-key': env.internalApiKey }
                            : {}),
                    },
                    body: JSON.stringify({
                        toolName,
                        arguments: toolArguments,
                    }),
                },
            );

            if (!response.ok) {
                return {
                    success: false,
                    message: 'Appointment service is not available right now.',
                };
            }

            return (await response.json()) as VapiToolResponse;
        } catch {
            return {
                success: false,
                message: 'Appointment service is not available right now.',
            };
        }
    }
}
