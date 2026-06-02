import { AppError } from '../../../shared/core/errors/app-error';
import {
    AiProvider,
    InterpretLabResultsInput,
} from '../../../infrastructure/ai/ai-provider';
import {
    LabInterpretationPatientVersionResponse,
    RiskFlag,
} from '../domain/ai.types';
import { AiLabInterpretationModel } from '../infrastructure/ai-lab-interpretation.model';

interface InterpretAndStoreInput extends InterpretLabResultsInput {
    patientId?: string;
}

interface StoredPatientLabInterpretation {
    labOrderId: string;
    patientInterpretation: string;
    disclaimer?: string;
    recommendations?: string[];
    riskFlags?: RiskFlag[];
}

export class LabInterpretationAiService {
    constructor(private readonly provider: AiProvider) {}

    async interpret(input: InterpretAndStoreInput) {
        const result = await this.provider.interpretLabResults(input);

        const interpretation = await AiLabInterpretationModel.findOneAndUpdate(
            { labOrderId: input.labOrderId },
            {
                $set: {
                    labOrderId: input.labOrderId,
                    patientId: input.patientId,
                    clinicalInterpretation: result.clinicalInterpretation,
                    patientInterpretation: result.patientInterpretation,
                    disclaimer: result.disclaimer,
                    riskFlags: result.riskFlags,
                    recommendations: result.recommendations,
                    model: result.model,
                    tokenUsage: result.tokenUsage,
                },
            },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        ).lean();

        return interpretation;
    }

    async getPatientVersionByLabOrderId(
        labOrderId: string,
    ): Promise<LabInterpretationPatientVersionResponse> {
        const interpretation = await AiLabInterpretationModel.findOne({
            labOrderId,
        })
            .select({
                _id: 0,
                labOrderId: 1,
                patientInterpretation: 1,
                disclaimer: 1,
                recommendations: 1,
                riskFlags: 1,
            })
            .lean<StoredPatientLabInterpretation>();

        if (!interpretation) {
            throw new AppError('AI lab interpretation not found', 404);
        }

        return toPatientLabInterpretationResponse(interpretation);
    }

    async getByLabOrderId(labOrderId: string) {
        const interpretation = await AiLabInterpretationModel.findOne({
            labOrderId,
        }).lean();

        if (!interpretation) {
            throw new AppError('AI lab interpretation not found', 404);
        }

        return interpretation;
    }
}

export function toPatientLabInterpretationResponse(
    interpretation: StoredPatientLabInterpretation,
): LabInterpretationPatientVersionResponse {
    return {
        labOrderId: interpretation.labOrderId,
        patientVersion: interpretation.patientInterpretation,
        disclaimer: interpretation.disclaimer,
        recommendations: interpretation.recommendations ?? [],
        riskFlags: (interpretation.riskFlags ?? []).map(formatRiskFlag),
    };
}

function formatRiskFlag(flag: RiskFlag) {
    const test = flag.testName.trim();
    const value = flag.value ? ` (${flag.value})` : '';

    return `${test} - ${flag.severity}${value}: ${flag.note}`;
}
