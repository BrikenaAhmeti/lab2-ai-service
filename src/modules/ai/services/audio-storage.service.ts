import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../../config/env';

const audioFolderName = 'consultation-audio';

const extensionByMimeType: Record<string, string> = {
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/mp4': '.m4a',
    'audio/m4a': '.m4a',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/webm': '.webm',
};

export interface StoredAudioFile {
    relativeUrl: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
}

export async function storeConsultationAudio(file: Express.Multer.File) {
    const folder = path.join(env.uploadsDir, audioFolderName);
    await mkdir(folder, { recursive: true });

    const filename = `${randomUUID()}${resolveAudioExtension(file)}`;
    const filePath = path.join(folder, filename);

    await writeFile(filePath, file.buffer);

    return {
        relativeUrl: `/uploads/${audioFolderName}/${filename}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
    } satisfies StoredAudioFile;
}

function resolveAudioExtension(file: Express.Multer.File) {
    const originalExtension = path.extname(file.originalname).toLowerCase();

    if (originalExtension && /^[a-z0-9.]+$/.test(originalExtension)) {
        return originalExtension;
    }

    return extensionByMimeType[file.mimetype] ?? '.webm';
}
