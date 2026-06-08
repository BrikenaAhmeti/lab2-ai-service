import { env } from '../../../config/env';
import { AppError } from '../../../shared/core/errors/app-error';
import {
    VapiCallArtifactLogResponse,
    VapiCallListResponse,
    VapiCallLogMessage,
    VapiCallLogView,
    VapiCallRecordingUrls,
} from '../domain/vapi-call-logs.types';
import {
    HttpVapiApiClient,
    VapiApiClient,
} from '../infrastructure/vapi-api.client';

export class VapiCallLogService {
    constructor(
        private readonly client: VapiApiClient = new HttpVapiApiClient(),
    ) {}

    async listCalls(input: {
        assistantId?: string;
        limit?: number;
    } = {}): Promise<VapiCallListResponse> {
        const assistantId = (input.assistantId ?? env.vapiAssistantId) || undefined;
        const limit = input.limit ?? 25;
        const calls = (await this.client.listCalls())
            .map(toCallLogView)
            .filter((call): call is VapiCallLogView => Boolean(call))
            .filter((call) => !assistantId || callBelongsToAssistant(call, assistantId))
            .sort((left, right) =>
                dateTime(right.createdAt).getTime() - dateTime(left.createdAt).getTime(),
            )
            .slice(0, limit);

        return {
            assistantId: assistantId ?? null,
            count: calls.length,
            calls,
        };
    }

    async getCall(callId: string): Promise<VapiCallLogView> {
        const call = toCallLogView(await this.client.getCall(callId));

        if (!call) {
            throw new AppError('Vapi call not found', 404);
        }

        return call;
    }

    async getArtifactLog(callId: string): Promise<VapiCallArtifactLogResponse> {
        const call = await this.getCall(callId);

        if (!call.logUrl) {
            throw new AppError('Vapi call log artifact is not available', 404);
        }

        const artifact = await this.client.fetchArtifact(call.logUrl);

        return {
            callId,
            logUrl: call.logUrl,
            ...artifact,
        };
    }
}

function toCallLogView(value: unknown): VapiCallLogView | null {
    const call = objectValue(value);
    const id = stringValue(call?.id);

    if (!call || !id) {
        return null;
    }

    const artifact = objectValue(call.artifact);
    const analysis = objectValue(call.analysis);
    const startedAt = stringValue(call.startedAt);
    const endedAt = stringValue(call.endedAt);

    return {
        id,
        type: stringValue(call.type) ?? null,
        status: stringValue(call.status) ?? null,
        assistantId: stringValue(call.assistantId) ?? firstAssistantActivationId(artifact) ?? null,
        createdAt: stringValue(call.createdAt) ?? null,
        updatedAt: stringValue(call.updatedAt) ?? null,
        startedAt: startedAt ?? null,
        endedAt: endedAt ?? null,
        endedReason: stringValue(call.endedReason) ?? null,
        durationSeconds: durationSeconds(startedAt, endedAt),
        cost: numberValue(call.cost),
        summary: stringValue(analysis?.summary) ?? stringValue(call.summary) ?? null,
        transcript: stringValue(artifact?.transcript) ?? stringValue(call.transcript) ?? null,
        messages: messageList(artifact?.messages ?? call.messages),
        recordingUrls: recordingUrls(artifact, call),
        logUrl: stringValue(artifact?.logUrl) ?? stringValue(call.logUrl) ?? null,
        pcapUrl: stringValue(artifact?.pcapUrl) ?? stringValue(call.pcapUrl) ?? null,
    };
}

function callBelongsToAssistant(call: VapiCallLogView, assistantId: string) {
    return call.assistantId === assistantId;
}

function recordingUrls(
    artifact: Record<string, unknown> | null,
    call: Record<string, unknown>,
): VapiCallRecordingUrls {
    const recording = objectValue(artifact?.recording);
    const mono = objectValue(recording?.mono);

    return {
        stereoUrl:
            stringValue(recording?.stereoUrl) ??
            stringValue(artifact?.stereoRecordingUrl) ??
            stringValue(call.stereoRecordingUrl) ??
            null,
        monoCombinedUrl: stringValue(mono?.combinedUrl) ?? null,
        assistantUrl: stringValue(mono?.assistantUrl) ?? null,
        customerUrl: stringValue(mono?.customerUrl) ?? null,
        videoUrl:
            stringValue(recording?.videoUrl) ??
            stringValue(artifact?.videoRecordingUrl) ??
            stringValue(call.videoRecordingUrl) ??
            null,
        legacyRecordingUrl:
            stringValue(artifact?.recordingUrl) ??
            stringValue(call.recordingUrl) ??
            null,
    };
}

function messageList(value: unknown): VapiCallLogMessage[] {
    return arrayValue(value)
        .map(objectValue)
        .filter((message): message is Record<string, unknown> => Boolean(message))
        .map((message) => ({
            role: stringValue(message.role) ?? 'unknown',
            message: stringValue(message.message) ?? stringValue(message.originalMessage) ?? '',
            time: numberValue(message.time),
            endTime: numberValue(message.endTime),
            secondsFromStart: numberValue(message.secondsFromStart),
            duration: numberValue(message.duration),
            speakerLabel: stringValue(message.speakerLabel) ?? null,
        }))
        .filter((message) => message.message.length > 0);
}

function firstAssistantActivationId(artifact: Record<string, unknown> | null) {
    const activation = arrayValue(artifact?.assistantActivations)
        .map(objectValue)
        .find((item): item is Record<string, unknown> => Boolean(item));

    return stringValue(activation?.assistantId);
}

function durationSeconds(startedAt?: string, endedAt?: string) {
    if (!startedAt || !endedAt) {
        return null;
    }

    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();

    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
        return null;
    }

    return Math.round((end - start) / 1000);
}

function dateTime(value?: string | null) {
    const date = value ? new Date(value) : new Date(0);

    return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function objectValue(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function arrayValue(value: unknown) {
    return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : undefined;
}

function numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
