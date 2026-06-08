import type { AiProvider } from '../../src/infrastructure/ai/ai-provider';
import { ConsultationAiService } from '../../src/modules/ai/services/consultation-ai.service';
import { AiConversationModel } from '../../src/modules/ai/infrastructure/ai-conversation.model';
import type { AppointmentClinicalContextClient } from '../../src/modules/ai/infrastructure/core-appointment-clinical-context.client';

describe('ConsultationAiService', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('stores structured doctor and patient conversation turns after transcription', async () => {
        const provider = fakeProvider();
        const turns = [
            { speaker: 'doctor' as const, text: 'How are you feeling today?' },
            { speaker: 'patient' as const, text: 'I have a sore throat.' },
        ];
        jest.mocked(provider.transcribeAudio).mockResolvedValue({
            text: 'How are you feeling today? I have a sore throat.',
            model: 'test-transcription-model',
        });
        jest.mocked(provider.structureConsultationConversation).mockResolvedValue(turns);
        const updateSpy = jest
            .spyOn(AiConversationModel, 'findOneAndUpdate')
            .mockResolvedValue({ appointmentId: 'appointment-1' } as never);
        const service = new ConsultationAiService(provider);

        const result = await service.transcribe({
            appointmentId: 'appointment-1',
            patientId: 'patient-1',
            staffId: 'staff-1',
            file: {
                buffer: Buffer.from('audio'),
                originalName: 'consultation.webm',
                mimeType: 'audio/webm',
            },
        });

        expect(result.conversationTurns).toEqual(turns);
        expect(updateSpy).toHaveBeenCalledWith(
            { appointmentId: 'appointment-1' },
            {
                $set: expect.objectContaining({
                    transcription: 'How are you feeling today? I have a sore throat.',
                    conversationTurns: turns,
                }),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
    });

    it('summarizes with privacy-safe clinical context from Core', async () => {
        const provider = fakeProvider();
        const turns = [
            { speaker: 'doctor' as const, text: 'What brings you in today?' },
            { speaker: 'patient' as const, text: 'Chest discomfort.' },
        ];
        const clinicalContextClient: AppointmentClinicalContextClient = {
            getByAppointmentId: jest.fn().mockResolvedValue({
                appointment: {
                    id: 'appointment-1',
                    appointmentType: 'IN_PERSON',
                    department: 'Cardiology',
                    service: 'General Consultation',
                    staffSpecialization: 'Cardiologist',
                },
                patient: {
                    gender: 'female',
                    bloodType: 'A_POSITIVE',
                    allergies: ['penicillin'],
                    medicalNotes: { chronicConditions: ['asthma'] },
                },
                recentMedicalRecords: [
                    {
                        chiefComplaint: 'Chest discomfort',
                        diagnosis: 'Stable exam',
                        treatmentPlan: 'Monitor symptoms',
                    },
                ],
                recentPrescriptions: [
                    {
                        status: 'ACTIVE',
                        diagnosis: 'Stable exam',
                        items: [
                            {
                                medicationName: 'Aspirin',
                                dosage: '81 mg',
                                frequency: 'Once daily',
                            },
                        ],
                    },
                ],
            }),
        };
        jest.spyOn(AiConversationModel, 'findOne').mockReturnValue({
            lean: jest.fn().mockResolvedValue({ conversationTurns: turns }),
        } as never);
        jest.spyOn(AiConversationModel, 'findOneAndUpdate').mockReturnValue({
            lean: jest.fn().mockResolvedValue({ appointmentId: 'appointment-1' }),
        } as never);
        const service = new ConsultationAiService(provider, clinicalContextClient);

        await service.summarize({
            appointmentId: 'appointment-1',
            patientId: 'patient-1',
            staffId: 'staff-1',
            transcription: 'Patient reports chest discomfort today.',
            context: {
                patientName: 'Ada Lovelace',
                email: 'ada@example.com',
            },
        });

        expect(provider.summarizeConsultation).toHaveBeenCalledWith({
            transcription: 'Patient reports chest discomfort today.',
            conversationTurns: turns,
            context: expect.objectContaining({
                privacy: expect.stringContaining('excludes patient name'),
                patientClinicalProfile: expect.objectContaining({
                    allergies: ['penicillin'],
                    medicalNotes: { chronicConditions: ['asthma'] },
                }),
                recentPrescriptions: expect.arrayContaining([
                    expect.objectContaining({
                        items: expect.arrayContaining([
                            expect.objectContaining({ medicationName: 'Aspirin' }),
                        ]),
                    }),
                ]),
            }),
        });
        const sentContext = jest.mocked(provider.summarizeConsultation).mock.calls[0][0].context;
        expect(JSON.stringify(sentContext)).not.toContain('Ada Lovelace');
        expect(JSON.stringify(sentContext)).not.toContain('ada@example.com');
    });
});

function fakeProvider(): AiProvider {
    return {
        transcribeAudio: jest.fn(),
        structureConsultationConversation: jest.fn().mockResolvedValue([
            { speaker: 'unknown', text: 'Patient reports chest discomfort today.' },
        ]),
        summarizeConsultation: jest.fn().mockResolvedValue({
            summary: {
                chiefComplaint: 'Chest discomfort',
                historyOfPresentIllness: 'Patient reports chest discomfort today.',
                examinationFindings: 'Pending doctor review',
                assessmentAndDiagnosis: 'Pending doctor review',
                treatmentPlan: 'Pending doctor review',
                followUpInstructions: 'Pending doctor review',
                aiReview: 'Verify red flags before finalizing.',
            },
            model: 'test-summary-model',
        }),
        interpretLabResults: jest.fn(),
        answerReservationMessage: jest.fn(),
        answerDashboardHelperQuestion: jest.fn(),
    };
}
