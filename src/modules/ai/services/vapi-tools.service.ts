import { schemaForVapiTool, vapiToolNameSchema } from '../domain/vapi-tools.schemas';
import { VapiToolResponse } from '../domain/vapi-tools.types';
import {
    CoreVapiToolsClient,
    VapiToolsClient,
} from '../infrastructure/core-vapi-tools.client';

export class VapiToolsService {
    constructor(
        private readonly client: VapiToolsClient = new CoreVapiToolsClient(),
    ) {}

    async executeTool(
        toolName: string,
        toolArguments: Record<string, unknown>,
    ): Promise<VapiToolResponse> {
        const toolNameResult = vapiToolNameSchema.safeParse(toolName);

        if (!toolNameResult.success) {
            return {
                success: false,
                message: `Unsupported Vapi tool: ${toolName}`,
            };
        }

        const schema = schemaForVapiTool(toolName);
        const parsedArguments = schema?.safeParse(toolArguments ?? {});

        if (!parsedArguments?.success) {
            return {
                success: false,
                message:
                    parsedArguments?.error.issues[0]?.message ?? 'Invalid tool input.',
            };
        }

        return this.client.executeTool(toolNameResult.data, parsedArguments.data);
    }
}
