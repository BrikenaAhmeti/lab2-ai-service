export interface VapiCallLogMessage {
    role: string;
    message: string;
    time?: number | null;
    endTime?: number | null;
    secondsFromStart?: number | null;
    duration?: number | null;
    speakerLabel?: string | null;
}

export interface VapiCallRecordingUrls {
    stereoUrl?: string | null;
    monoCombinedUrl?: string | null;
    assistantUrl?: string | null;
    customerUrl?: string | null;
    videoUrl?: string | null;
    legacyRecordingUrl?: string | null;
}

export interface VapiCallLogView {
    id: string;
    type?: string | null;
    status?: string | null;
    assistantId?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    endedReason?: string | null;
    durationSeconds?: number | null;
    cost?: number | null;
    summary?: string | null;
    transcript?: string | null;
    messages: VapiCallLogMessage[];
    recordingUrls: VapiCallRecordingUrls;
    logUrl?: string | null;
    pcapUrl?: string | null;
}

export interface VapiCallListResponse {
    assistantId?: string | null;
    count: number;
    calls: VapiCallLogView[];
}

export interface VapiCallArtifactLogResponse {
    callId: string;
    logUrl: string;
    contentType: string;
    body: unknown;
}
