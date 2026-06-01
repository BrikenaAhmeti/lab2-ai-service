import {
    buildClinicalRangeSummary,
    buildPatientSafeLabInterpretation,
    isUnsafeLabInterpretationText,
    LAB_INTERPRETATION_SYSTEM_PROMPT,
} from '../../src/modules/ai/domain/lab-interpretation-guidance';

describe('lab interpretation guidance', () => {
    it('builds a calm patient-safe range explanation for abnormal results', () => {
        const result = buildPatientSafeLabInterpretation([
            {
                name: 'Glucose',
                value: 180,
                unit: 'mg/dL',
                referenceRange: '70-99 mg/dL',
                flag: 'high',
            },
            {
                name: 'TSH',
                value: 0.2,
                unit: 'mIU/L',
                referenceRange: '0.4-4.0 mIU/L',
                flag: 'low',
            },
        ]);

        expect(result.patientInterpretation).toContain(
            'Glucose is above the provided reference range',
        );
        expect(result.patientInterpretation).toContain(
            'TSH is below the provided reference range',
        );
        expect(result.patientInterpretation).toContain(
            '0.4-4.0 mIU/L). This does not diagnose a condition.',
        );
        expect(result.patientInterpretation).not.toMatch(/heart attack|cancer|stroke/i);
        expect(result.disclaimer).toContain('not a diagnosis');
        expect(result.riskFlags).toEqual([
            {
                testName: 'Glucose',
                severity: 'moderate',
                value: '180 mg/dL',
                note: 'Above the provided reference range: 70-99 mg/dL',
            },
            {
                testName: 'TSH',
                severity: 'moderate',
                value: '0.2 mIU/L',
                note: 'Below the provided reference range: 0.4-4.0 mIU/L',
            },
        ]);
        expect(result.recommendations).toContain(
            'Your clinic may direct glucose, thyroid, or hormone-related values to Endocrinology for review.',
        );
    });

    it('does not invent abnormal meaning when no result is flagged', () => {
        const result = buildPatientSafeLabInterpretation([
            {
                name: 'Hemoglobin',
                value: 13.5,
                unit: 'g/dL',
                referenceRange: '12-16 g/dL',
                flag: 'normal',
            },
        ]);

        expect(result.patientInterpretation).toContain(
            'no values were marked outside the provided reference ranges',
        );
        expect(result.riskFlags).toEqual([]);
    });

    it('keeps clinical fallback focused on ranges', () => {
        expect(
            buildClinicalRangeSummary([
                {
                    name: 'LDL',
                    value: 160,
                    unit: 'mg/dL',
                    referenceRange: '<100 mg/dL',
                    flag: 'high',
                },
            ]),
        ).toContain('LDL');
    });

    it('documents the OpenAI prompt guardrails against diagnoses and panic', () => {
        expect(LAB_INTERPRETATION_SYSTEM_PROMPT).toContain('Do not diagnose');
        expect(LAB_INTERPRETATION_SYSTEM_PROMPT).toContain(
            'above, below, or outside the provided reference range',
        );
        expect(isUnsafeLabInterpretationText('Possible heart attack')).toBe(true);
    });
});
