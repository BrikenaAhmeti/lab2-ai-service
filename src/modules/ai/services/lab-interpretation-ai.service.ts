import { AppError } from '../../../shared/core/errors/app-error';
import {
    AiProvider,
    InterpretLabResultsInput,
} from '../../../infrastructure/ai/ai-provider';
import { AiLabInterpretationModel } from '../infrastructure/ai-lab-interpretation.model';

interface InterpretAndStoreInput extends InterpretLabResultsInput {
    patientId?: string;
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
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();

        return interpretation;
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
