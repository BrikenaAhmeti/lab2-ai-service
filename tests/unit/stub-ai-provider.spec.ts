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

    it('answers dashboard helper questions by role without clinical advice', async () => {
        const provider = new StubAiProvider();

        const result = await provider.answerDashboardHelperQuestion({
            sessionId: 'dashboard-session-1',
            role: 'Doctor',
            question: 'What should I check first?',
            messages: [
                {
                    role: 'user',
                    content: 'What should I check first?',
                },
            ],
            knowledgeBase: doctorKnowledgeBase,
        });

        expect(result.reply).toContain('Doctor Dashboard');
        expect(result.model).toBe('stub-dashboard-helper');

        const clinicalResult = await provider.answerDashboardHelperQuestion({
            sessionId: 'dashboard-session-1',
            role: 'Patient',
            question: 'What does my lab result mean?',
            messages: [
                {
                    role: 'user',
                    content: 'What does my lab result mean?',
                },
            ],
            knowledgeBase: patientKnowledgeBase,
        });

        expect(clinicalResult.reply).toContain('qualified medical professional');
    });

    it('answers only from the current role knowledge base scope', async () => {
        const provider = new StubAiProvider();

        const patientResult = await provider.answerDashboardHelperQuestion({
            sessionId: 'dashboard-session-3',
            role: 'Patient',
            question: 'How do I see my lab results?',
            messages: [
                {
                    role: 'user',
                    content: 'How do I see my lab results?',
                },
            ],
            knowledgeBase: patientKnowledgeBase,
        });

        expect(patientResult.reply).toContain('Open Lab Results from the Patient Portal');

        const crossRoleResult = await provider.answerDashboardHelperQuestion({
            sessionId: 'dashboard-session-3',
            role: 'Patient',
            question: 'How do I use the Admin Portal reports?',
            messages: [
                {
                    role: 'user',
                    content: 'How do I use the Admin Portal reports?',
                },
            ],
            knowledgeBase: `${patientKnowledgeBase}\n${adminKnowledgeBase}`,
        });

        expect(crossRoleResult.reply).toBe(
            'Your role or permissions may not include that module.',
        );
    });

    it('does not answer dashboard helper questions outside the knowledge base scope', async () => {
        const provider = new StubAiProvider();

        const result = await provider.answerDashboardHelperQuestion({
            sessionId: 'dashboard-session-2',
            role: 'Doctor',
            question: 'What is the weather tomorrow?',
            messages: [
                {
                    role: 'user',
                    content: 'What is the weather tomorrow?',
                },
            ],
            knowledgeBase: doctorKnowledgeBase,
        });

        expect(result.reply).toContain(
            'Please contact info@medsphere.com or use Contact Us on the website.',
        );
    });
});

const doctorKnowledgeBase = `
## Table 17

Screen | What the screen is for
Dashboard | Shows today's appointments, checked-in or ready patients, unread messages, pending lab reviews, and clinical actions.

## Table 20

User question | Good AI answer
What should I do first today? | Open the Doctor Dashboard and check today's checked-in or ready consultations. Start with the next ready patient.
`;

const patientKnowledgeBase = `
## Table 9

Screen | What the screen is for
Lab Results | Shows completed or reviewed lab results, flags, critical warnings, and AI explanation when available.

## Table 12

User question | Good AI answer
How do I see my lab results? | Open Lab Results from the Patient Portal. Select a completed or reviewed result to see the values, flags, and AI explanation if it is available.
`;

const adminKnowledgeBase = `
## Table 36

User question | Good AI answer
How do I add a new service? | Open Services, choose Add Service, select the department, enter the service name, duration, price, active status, and save.
`;
