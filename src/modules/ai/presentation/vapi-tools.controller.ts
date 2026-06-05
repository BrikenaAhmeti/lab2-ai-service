import { Request, Response } from 'express';
import { ParsedVapiToolCall, VapiToolResponse } from '../domain/vapi-tools.types';
import { VapiToolsService } from '../services/vapi-tools.service';

export class VapiToolsController {
    constructor(private readonly service = new VapiToolsService()) {}

    async handle(req: Request, res: Response) {
        const vapiCalls = extractVapiToolCalls(req.body);

        if (vapiCalls.length > 0) {
            const results = await Promise.all(
                vapiCalls.map(async (call) => ({
                    toolCallId: call.id,
                    result: stringifyToolResult(
                        await this.service.executeTool(call.name, call.arguments),
                    ),
                })),
            );

            return res.status(200).json({ results });
        }

        const directCall = extractDirectToolCall(req.body);

        if (directCall) {
            const result = await this.service.executeTool(
                directCall.name,
                directCall.arguments,
            );

            return res.status(200).json(result);
        }

        return res.status(200).json({
            success: false,
            message: 'No Vapi tool call was found in the request.',
        });
    }
}

export function extractVapiToolCalls(body: unknown): ParsedVapiToolCall[] {
    if (!body || typeof body !== 'object') {
        return [];
    }

    const record = body as Record<string, unknown>;
    const message = objectValue(record.message);
    const candidateArrays = [
        arrayValue(message?.toolCallList),
        arrayValue(message?.toolCalls),
        arrayValue(message?.tool_calls),
        arrayValue(record.toolCallList),
        arrayValue(record.toolCalls),
        arrayValue(record.tool_calls),
    ].filter((value): value is unknown[] => Array.isArray(value));
    const candidateSingles = [
        objectValue(message?.toolCall),
        objectValue(record.toolCall),
        objectValue(record.tool_call),
    ].filter((value): value is Record<string, unknown> => Boolean(value));
    const rawCalls = [...candidateArrays.flat(), ...candidateSingles];

    return rawCalls
        .map((call, index) => normalizeToolCall(call, index))
        .filter((call): call is ParsedVapiToolCall => Boolean(call));
}

function extractDirectToolCall(body: unknown): ParsedVapiToolCall | null {
    if (!body || typeof body !== 'object') {
        return null;
    }

    return normalizeToolCall(body, 0, true);
}

function normalizeToolCall(
    value: unknown,
    index: number,
    direct = false,
): ParsedVapiToolCall | null {
    const record = objectValue(value);

    if (!record) return null;

    const functionRecord = objectValue(record.function);
    const functionCallRecord = objectValue(record.functionCall);
    const name =
        stringValue(record.name) ??
        stringValue(record.toolName) ??
        stringValue(record.tool) ??
        stringValue(functionRecord?.name) ??
        stringValue(functionCallRecord?.name);

    if (!name) return null;

    const rawArguments =
        record.arguments ??
        record.args ??
        record.input ??
        record.parameters ??
        functionRecord?.arguments ??
        functionRecord?.parameters ??
        functionCallRecord?.arguments ??
        {};
    const parsedArguments = parseArguments(rawArguments);

    if (!parsedArguments) return null;

    return {
        id:
            stringValue(record.id) ??
            stringValue(record.toolCallId) ??
            stringValue(record.callId) ??
            (direct ? 'direct-tool-call' : `tool-call-${index}`),
        name,
        arguments: parsedArguments,
    };
}

function parseArguments(value: unknown): Record<string, unknown> | null {
    if (value === undefined || value === null) {
        return {};
    }

    if (typeof value === 'string') {
        try {
            return parseArguments(JSON.parse(value));
        } catch {
            return null;
        }
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    return null;
}

function stringifyToolResult(result: VapiToolResponse) {
    return JSON.stringify(result);
}

function objectValue(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function arrayValue(value: unknown) {
    return Array.isArray(value) ? value : null;
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : undefined;
}
