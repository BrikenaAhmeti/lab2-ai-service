import { StubAiProvider } from '../../src/infrastructure/ai/ai-provider';

describe('StubAiProvider', () => {
    it('returns patient-safe lab interpretation disclaimers', async () => {
        const provider = new StubAiProvider();

        const result = await provider.interpretLabResults({
            labOrderId: 'lab-1',
            results: [
                {
                    name: 'Glucose',
                    value: 180,
                    unit: 'mg/dL',
                    referenceRange: '70-99',
                    flag: 'high',
                },
            ],
        });

        expect(result.disclaimer).toContain('not a diagnosis');
        expect(result.patientInterpretation).toContain(
            'Glucose is above the provided reference range',
        );
        expect(result.recommendations).toContain(
            'Your clinic may direct glucose, thyroid, or hormone-related values to Endocrinology for review.',
        );
        expect(result.riskFlags).toHaveLength(1);
    });

    it('keeps reservation replies inside booking scope', async () => {
        const provider = new StubAiProvider();

        const result = await provider.answerReservationMessage({
            sessionId: 'session-1',
            messages: [
                {
                    role: 'user',
                    content: 'Can you give me medical advice?',
                },
            ],
        });

        expect(result.reply).toContain('cannot provide medical advice');
        expect(result.outcome).toBe('in_progress');
    });
});
