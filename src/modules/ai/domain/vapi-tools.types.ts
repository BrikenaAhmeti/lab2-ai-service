export const vapiToolNames = [
    'resolveAppointmentContext',
    'checkAvailability',
    'bookAppointment',
] as const;

export type VapiToolName = (typeof vapiToolNames)[number];

export interface ResolveAppointmentContextInput {
    doctorName?: string;
    serviceName?: string;
    departmentName?: string;
}

export interface CheckAvailabilityInput extends ResolveAppointmentContextInput {
    date: string;
    preferredTime?: string;
}

export interface BookAppointmentInput extends ResolveAppointmentContextInput {
    startTime: string;
    personalNumber: string;
    patientFirstName: string;
    patientLastName: string;
    patientPhone?: string;
    patientEmail?: string;
    dateOfBirth?: string;
    notes?: string;
}

export type VapiToolArguments =
    | ResolveAppointmentContextInput
    | CheckAvailabilityInput
    | BookAppointmentInput;

export interface VapiToolResponse {
    success: boolean;
    message?: string;
    [key: string]: unknown;
}

export interface ParsedVapiToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}
