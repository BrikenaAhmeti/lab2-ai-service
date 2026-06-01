import {
    LabInterpretationResult,
    LabResultItem,
    RiskFlag,
} from './ai.types';

type SafeLabInterpretation = Pick<
    LabInterpretationResult,
    'patientInterpretation' | 'disclaimer' | 'riskFlags' | 'recommendations'
>;

const ABNORMAL_FLAGS = new Set(['low', 'high', 'critical']);

const DEPARTMENT_HINTS = [
    {
        department: 'Cardiology',
        label: 'heart or cholesterol-related values',
        terms: [
            'cholesterol',
            'hdl',
            'ldl',
            'triglyceride',
            'troponin',
            'bnp',
            'ck-mb',
        ],
    },
    {
        department: 'Endocrinology',
        label: 'glucose, thyroid, or hormone-related values',
        terms: ['glucose', 'hba1c', 'a1c', 'insulin', 'tsh', 't3', 't4', 'thyroid'],
    },
    {
        department: 'Nephrology',
        label: 'kidney or urine-related values',
        terms: ['creatinine', 'urea', 'bun', 'egfr', 'urine', 'albumin'],
    },
    {
        department: 'Gastroenterology',
        label: 'liver or digestion-related values',
        terms: ['alt', 'ast', 'bilirubin', 'alp', 'ggt', 'albumin'],
    },
    {
        department: 'Hematology',
        label: 'blood count-related values',
        terms: ['hemoglobin', 'wbc', 'rbc', 'platelet', 'hematocrit', 'mcv'],
    },
];

export const LAB_INTERPRETATION_DISCLAIMER =
    'AI-generated range explanation only - not a diagnosis. Review the full result with your doctor or ordering clinician.';

export const LAB_INTERPRETATION_SYSTEM_PROMPT = [
    'Return only JSON with keys clinicalInterpretation, patientInterpretation, disclaimer, riskFlags, recommendations.',
    'Interpret only the submitted lab values, flags, units, and reference ranges.',
    'Do not diagnose, predict, or name diseases or conditions. Do not say the patient has or may have a disease.',
    'Keep the patientInterpretation calm and plain: say whether a value is above, below, or outside the provided reference range and include the submitted value when useful.',
    'Recommendations must only direct the patient to the ordering clinician or an appropriate department for review. Do not provide treatment, medication, diet, emergency triage, or lifestyle instructions.',
    'The clinicalInterpretation is for clinician review only and must not replace clinical judgment.',
].join(' ');

export function buildClinicalRangeSummary(results: LabResultItem[]) {
    const abnormalResults = getAbnormalResults(results);

    if (abnormalResults.length === 0) {
        return 'No submitted lab values were marked outside the provided reference ranges.';
    }

    const names = abnormalResults.map((result) => result.name.trim()).join(', ');

    return `Submitted lab values marked outside the provided reference ranges: ${names}. Review against the full lab report and patient context.`;
}

export function buildPatientSafeLabInterpretation(
    results: LabResultItem[],
): SafeLabInterpretation {
    const abnormalResults = getAbnormalResults(results);

    if (abnormalResults.length === 0) {
        return {
            patientInterpretation:
                'Based on the flags sent to the AI service, no values were marked outside the provided reference ranges. Please review the full result with your doctor or ordering clinician.',
            disclaimer: LAB_INTERPRETATION_DISCLAIMER,
            riskFlags: [],
            recommendations: [
                'Review the full lab report with the ordering clinician.',
            ],
        };
    }

    const resultSentences = abnormalResults.slice(0, 6).map(describeResult);
    const remainingCount = abnormalResults.length - resultSentences.length;
    const remainingText =
        remainingCount > 0
            ? `There are ${remainingCount} additional flagged value(s) in the report.`
            : '';

    return {
        patientInterpretation: [
            `Some lab values were marked outside the provided reference range: ${resultSentences.join(' ')}`,
            remainingText,
            'This does not diagnose a condition. Please review the full result with your doctor or ordering clinician.',
        ]
            .filter(Boolean)
            .join(' ')
            .trim(),
        disclaimer: LAB_INTERPRETATION_DISCLAIMER,
        riskFlags: abnormalResults.map(toRiskFlag),
        recommendations: buildRecommendations(abnormalResults),
    };
}

export function isUnsafeLabInterpretationText(value: string) {
    const normalized = value.toLowerCase();

    return [
        'diagnos',
        'disease',
        'cancer',
        'heart attack',
        'stroke',
        'failure',
        'tumor',
        'sepsis',
    ].some((phrase) => normalized.includes(phrase));
}

function getAbnormalResults(results: LabResultItem[]) {
    return results.filter(
        (result) => result.flag && ABNORMAL_FLAGS.has(result.flag),
    );
}

function describeResult(result: LabResultItem) {
    const reference = result.referenceRange
        ? `; reference range: ${result.referenceRange.trim()}`
        : '';

    return `${result.name.trim()} is ${directionFor(result)} the provided reference range (${displayValue(result)}${reference}).`;
}

function directionFor(result: LabResultItem) {
    if (result.flag === 'low') {
        return 'below';
    }

    if (result.flag === 'high') {
        return 'above';
    }

    return 'outside';
}

function displayValue(result: LabResultItem) {
    const value = String(result.value).trim();
    const unit = result.unit?.trim();

    return unit ? `${value} ${unit}` : value;
}

function toRiskFlag(result: LabResultItem): RiskFlag {
    return {
        testName: result.name.trim(),
        severity: result.flag === 'critical' ? 'critical' : 'moderate',
        value: displayValue(result),
        note: `${capitalize(directionFor(result))} the provided reference range${
            result.referenceRange ? `: ${result.referenceRange.trim()}` : '.'
        }`,
    };
}

function buildRecommendations(results: LabResultItem[]) {
    const recommendations = ['Review the full lab report with the ordering clinician.'];
    const departments = new Set<string>();

    for (const result of results) {
        const name = result.name.toLowerCase();
        const hint = DEPARTMENT_HINTS.find((item) =>
            item.terms.some((term) => name.includes(term)),
        );

        if (hint && !departments.has(hint.department)) {
            departments.add(hint.department);
            recommendations.push(
                `Your clinic may direct ${hint.label} to ${hint.department} for review.`,
            );
        }
    }

    if (recommendations.length === 1) {
        recommendations.push(
            'If the ordering clinician thinks a specialist should review it, they can direct you to the right department.',
        );
    }

    return recommendations;
}

function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
