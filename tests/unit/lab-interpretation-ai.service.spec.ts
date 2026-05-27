import { toPatientLabInterpretationResponse } from '../../src/modules/ai/services/lab-interpretation-ai.service';

describe('toPatientLabInterpretationResponse', () => {
    it('maps stored lab interpretation to the MS-55 patient response contract', () => {
        const response = toPatientLabInterpretationResponse({
            labOrderId: 'lab-1',
            patientInterpretation: 'Your glucose result is higher than expected.',
            disclaimer: 'AI-generated explanation - discuss results with your doctor.',
            recommendations: ['Review the result with a licensed clinician.'],
            riskFlags: [
                {
                    testName: 'Glucose',
                    severity: 'moderate',
                    value: '180 mg/dL',
                    note: 'Reference range: 70-99 mg/dL',
                },
            ],
        });

        expect(response).toEqual({
            labOrderId: 'lab-1',
            patientVersion: 'Your glucose result is higher than expected.',
            disclaimer: 'AI-generated explanation - discuss results with your doctor.',
            recommendations: ['Review the result with a licensed clinician.'],
            riskFlags: ['Glucose - moderate (180 mg/dL): Reference range: 70-99 mg/dL'],
        });
    });
});
