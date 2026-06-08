import { env } from '../../../config/env';

export interface AppointmentClinicalContext {
    appointment?: {
        id?: string;
        appointmentType?: string;
        scheduledAt?: string;
        department?: string;
        service?: string;
        staffSpecialization?: string | null;
    };
    patient?: {
        gender?: string | null;
        bloodType?: string | null;
        allergies?: unknown;
        medicalNotes?: unknown;
    };
    recentMedicalRecords?: Array<{
        createdAt?: string;
        department?: string;
        chiefComplaint?: string | null;
        diagnosis?: string | null;
        treatmentPlan?: string | null;
        followUpInstructions?: string | null;
    }>;
    recentPrescriptions?: Array<{
        issuedAt?: string;
        status?: 'ACTIVE' | 'VOIDED';
        diagnosis?: string | null;
        items?: Array<{
            medicationName?: string;
            dosage?: string;
            frequency?: string;
            durationInstructions?: string | null;
            notes?: string | null;
        }>;
    }>;
}

export interface AppointmentClinicalContextClient {
    getByAppointmentId(appointmentId: string): Promise<AppointmentClinicalContext | null>;
}

export class CoreAppointmentClinicalContextClient implements AppointmentClinicalContextClient {
    async getByAppointmentId(appointmentId: string): Promise<AppointmentClinicalContext | null> {
        if (!env.internalApiKey) {
            return null;
        }

        try {
            const response = await fetch(
                `${env.coreServiceUrl.replace(/\/$/, '')}/internal/appointments/${encodeURIComponent(appointmentId)}/ai-clinical-context`,
                {
                    headers: {
                        'x-internal-api-key': env.internalApiKey,
                    },
                },
            );

            if (!response.ok) {
                return null;
            }

            return (await response.json()) as AppointmentClinicalContext;
        } catch {
            return null;
        }
    }
}
