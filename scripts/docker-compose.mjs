import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const dockerConfigDir = path.join(tmpdir(), 'medsphere-ai-service-docker-config');
const pluginDir = path.join(dockerConfigDir, 'cli-plugins');
const requestedArgs = process.argv.slice(2);

if (requestedArgs.length === 0) {
    console.error('Usage: node scripts/docker-compose.mjs <compose args>');
    process.exit(1);
}

mkdirSync(pluginDir, { recursive: true });
writeFileSync(path.join(dockerConfigDir, 'config.json'), '{}\n');

const originalDockerConfig = process.env.DOCKER_CONFIG || path.join(homedir(), '.docker');
const candidatePluginDirs = [
    path.join(originalDockerConfig, 'cli-plugins'),
    '/Applications/Docker.app/Contents/Resources/cli-plugins',
    '/usr/local/lib/docker/cli-plugins',
    '/usr/lib/docker/cli-plugins',
    '/usr/libexec/docker/cli-plugins',
];

for (const pluginName of ['docker-compose', 'docker-buildx']) {
    const target = path.join(pluginDir, pluginName);

    if (existsSync(target)) {
        continue;
    }

    const source = candidatePluginDirs
        .map((dir) => path.join(dir, pluginName))
        .find((candidate) => existsSync(candidate));

    if (source) {
        try {
            symlinkSync(source, target);
        } catch {
            copyFileSync(source, target);
        }
    }
}

const child = spawn('docker', ['compose', ...requestedArgs], {
    env: {
        ...process.env,
        DOCKER_CONFIG: dockerConfigDir,
    },
    stdio: 'inherit',
});

child.on('exit', (code, signal) => {
    if (signal) {
        console.error(`docker compose exited from signal ${signal}`);
        process.exit(1);
    }

    process.exit(code ?? 1);
});
