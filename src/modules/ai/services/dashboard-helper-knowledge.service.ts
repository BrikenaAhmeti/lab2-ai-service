import fs from 'node:fs';
import { env } from '../../../config/env';

let cachedKnowledgeBase: string | null = null;

export function getDashboardHelperKnowledgeBase() {
    if (cachedKnowledgeBase !== null) {
        return cachedKnowledgeBase;
    }

    cachedKnowledgeBase = fs.readFileSync(
        env.dashboardHelperKnowledgeBasePath,
        'utf-8',
    );

    return cachedKnowledgeBase;
}

export function clearDashboardHelperKnowledgeBaseCache() {
    cachedKnowledgeBase = null;
}
