import { z } from 'zod';
import { vapiToolNames } from './vapi-tools.types';

const optionalNaturalText = z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(160).optional(),
);

function requiredText(message: string, max: number) {
    return z.preprocess(
        (value) => (value === undefined || value === null ? '' : value),
        z.string().trim().min(1, message).max(max),
    );
}

const appointmentContextInputObject = z.object({
    doctorName: optionalNaturalText,
    serviceName: optionalNaturalText,
    departmentName: optionalNaturalText,
});

function hasContext(input: {
    doctorName?: string;
    serviceName?: string;
    departmentName?: string;
}) {
    return Boolean(input.doctorName || input.serviceName || input.departmentName);
}

export const resolveAppointmentContextInputSchema = appointmentContextInputObject
    .refine(hasContext, {
        message: 'At least one doctor, service or department name is required.',
    });

export const checkAvailabilityInputSchema = appointmentContextInputObject
    .extend({
        date: z.string().trim().min(1, 'Date is required.').max(80),
        preferredTime: optionalNaturalText,
    })
    .refine(hasContext, {
        message: 'At least one doctor, service or department name is required.',
    });

export const bookAppointmentInputSchema = z
    .object({
        doctorName: optionalNaturalText,
        serviceName: optionalNaturalText,
        departmentName: optionalNaturalText,
        startTime: requiredText('Start time is required.', 120),
        personalNumber: requiredText('Personal number is required.', 80),
        patientFirstName: requiredText('Patient first name is required.', 100),
        patientLastName: requiredText('Patient last name is required.', 100),
        patientPhone: optionalNaturalText,
        patientEmail: z.preprocess(
            (value) =>
                typeof value === 'string' && value.trim() === ''
                    ? undefined
                    : value,
            z.string().trim().max(320).optional(),
        ),
        dateOfBirth: optionalNaturalText,
        notes: z.preprocess(
            (value) =>
                typeof value === 'string' && value.trim() === ''
                    ? undefined
                    : value,
            z.string().trim().max(1000).optional(),
        ),
    })
    .refine((input) => Boolean(input.doctorName || input.serviceName), {
        message: 'Doctor name or service name is required.',
    });

export const vapiToolNameSchema = z.enum(vapiToolNames);

export function schemaForVapiTool(toolName: string) {
    if (toolName === 'resolveAppointmentContext') {
        return resolveAppointmentContextInputSchema;
    }

    if (toolName === 'checkAvailability') {
        return checkAvailabilityInputSchema;
    }

    if (toolName === 'bookAppointment') {
        return bookAppointmentInputSchema;
    }

    return null;
}
