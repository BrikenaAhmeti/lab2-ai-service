export type AiProviderMode = 'stub' | 'openai';

export interface UploadedAudio {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
}

export interface TokenUsage {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}

export interface ConsultationSummary {
    chiefComplaint: string;
    historyOfPresentIllness: string;
    examinationFindings: string;
    assessmentAndDiagnosis: string;
    treatmentPlan: string;
    followUpInstructions: string;
}

export interface TranscriptionResult {
    text: string;
    model: string;
    tokenUsage?: TokenUsage;
}

export interface SummaryResult {
    summary: ConsultationSummary;
    model: string;
    tokenUsage?: TokenUsage;
}

export interface LabResultItem {
    name: string;
    value: string | number;
    unit?: string;
    referenceRange?: string;
    flag?: 'low' | 'normal' | 'high' | 'critical';
}

export interface PatientContext {
    age?: number;
    gender?: string;
    knownConditions?: string[];
}

export interface RiskFlag {
    testName: string;
    severity: 'low' | 'moderate' | 'high' | 'critical';
    value?: string;
    note: string;
}

export interface LabInterpretationResult {
    clinicalInterpretation: string;
    patientInterpretation: string;
    disclaimer: string;
    riskFlags: RiskFlag[];
    recommendations: string[];
    model: string;
    tokenUsage?: TokenUsage;
}

export type ReservationOutcome = 'in_progress' | 'booked' | 'abandoned' | 'referred';

export interface ReservationMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    timestamp?: Date;
}

export interface ReservationAgentResult {
    reply: string;
    outcome: ReservationOutcome;
    suggestedDepartment?: string;
    suggestedStaff?: string;
    appointmentId?: string;
    model: string;
    tokenUsage?: TokenUsage;
}
