import { createAiProvider } from '../src/infrastructure/ai/ai-provider';
import {
    connectMongo,
    disconnectMongo,
} from '../src/infrastructure/mongodb/mongoose';
import type {
    LabResultItem,
    PatientContext,
} from '../src/modules/ai/domain/ai.types';
import { LabInterpretationAiService } from '../src/modules/ai/services/lab-interpretation-ai.service';

interface DemoLabInterpretationFixture {
    labOrderId: string;
    patientId: string;
    patientContext?: PatientContext;
    results: LabResultItem[];
}

const DEMO_PATIENT_IDS = {
    olivia: '55555555-5555-4555-8555-555555555555',
    samir: 'a1000000-0000-4000-8000-000000000001',
    lina: 'a1000000-0000-4000-8000-000000000002',
    mateo: 'a1000000-0000-4000-8000-000000000005',
} as const;

const DEMO_LAB_INTERPRETATIONS: DemoLabInterpretationFixture[] = [
    {
        labOrderId: '50000000-0000-4000-8000-000000000001',
        patientId: DEMO_PATIENT_IDS.olivia,
        patientContext: {
            age: 36,
            gender: 'female',
            knownConditions: ['Mild intermittent asthma'],
        },
        results: [
            {
                name: 'Complete Blood Count',
                value: 13.4,
                unit: 'g/dL',
                referenceRange: 'Hemoglobin 12.0 - 16.0 g/dL',
                flag: 'normal' as const,
            },
        ],
    },
    {
        labOrderId: '50000000-0000-4000-8000-000000000003',
        patientId: DEMO_PATIENT_IDS.olivia,
        patientContext: {
            age: 36,
            gender: 'female',
            knownConditions: ['Seasonal asthma'],
        },
        results: [
            {
                name: 'Complete Blood Count',
                value: 12.8,
                unit: 'g/dL',
                referenceRange: 'Hemoglobin 12.0 - 16.0 g/dL',
                flag: 'normal' as const,
            },
            {
                name: 'Basic Metabolic Panel',
                value: 156,
                unit: 'mg/dL',
                referenceRange: 'Glucose 70 - 110 mg/dL',
                flag: 'high' as const,
            },
            {
                name: 'Hemoglobin A1c',
                value: 8.2,
                unit: '%',
                referenceRange: 'Below 5.7%',
                flag: 'high' as const,
            },
            {
                name: 'C-Reactive Protein',
                value: 22,
                unit: 'mg/L',
                referenceRange: 'Below 10 mg/L',
                flag: 'high' as const,
            },
        ],
    },
    {
        labOrderId: 'a5000000-0000-4000-8000-000000000001',
        patientId: DEMO_PATIENT_IDS.samir,
        patientContext: {
            age: 44,
            gender: 'male',
            knownConditions: ['Hyperlipidemia'],
        },
        results: [
            {
                name: 'Lipid Panel',
                value: 146,
                unit: 'mg/dL',
                referenceRange: 'LDL under 100 mg/dL',
                flag: 'high' as const,
            },
            {
                name: 'Liver Function Panel',
                value: 28,
                unit: 'U/L',
                referenceRange: 'ALT 7 - 56 U/L',
                flag: 'normal' as const,
            },
        ],
    },
    {
        labOrderId: 'a5000000-0000-4000-8000-000000000004',
        patientId: DEMO_PATIENT_IDS.mateo,
        patientContext: {
            age: 57,
            gender: 'male',
            knownConditions: ['Cardiology follow-up'],
        },
        results: [
            {
                name: 'Troponin I',
                value: 0.12,
                unit: 'ng/mL',
                referenceRange: 'Below 0.04 ng/mL',
                flag: 'critical' as const,
            },
        ],
    },
    {
        labOrderId: 'a5000000-0000-4000-8000-000000000005',
        patientId: DEMO_PATIENT_IDS.lina,
        patientContext: {
            age: 10,
            gender: 'female',
        },
        results: [
            {
                name: 'COVID-19 Antigen',
                value: 'Negative',
                referenceRange: 'Negative',
                flag: 'normal' as const,
            },
        ],
    },
];

async function main() {
    await connectMongo();

    const service = new LabInterpretationAiService(createAiProvider());
    const interpretations = [];

    for (const fixture of DEMO_LAB_INTERPRETATIONS) {
        const interpretation = await service.interpret(fixture);
        interpretations.push(interpretation);
    }

    console.log('AI lab interpretation seed complete.');
    for (const interpretation of interpretations) {
        console.log(
            JSON.stringify(
                {
                    labOrderId: interpretation.labOrderId,
                    model: interpretation.model,
                    clinicalInterpretation: interpretation.clinicalInterpretation,
                    patientInterpretation: interpretation.patientInterpretation,
                    riskFlags: interpretation.riskFlags,
                    recommendations: interpretation.recommendations,
                    tokenUsage: interpretation.tokenUsage,
                },
                null,
                2,
            ),
        );
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await disconnectMongo();
    });
