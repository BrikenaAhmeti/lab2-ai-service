# MedSphere AI Service

AI microservice for Lab2 MedSphere. It owns consultation audio transcription, consultation summary drafts, lab result interpretation, patient-facing lab explanation text, and the reservation-agent conversation endpoint.

The service stores AI workflow data in MongoDB. It does not own PostgreSQL/Prisma domain data for patients, appointments, departments, billing, or users.

## Port

- Local and Docker API: `http://localhost:3010`
- Container port: `3010`
- Health: `GET /health`
- API base path: `/api/ai`

## Data Stores

- MongoDB via Mongoose for AI conversations, lab interpretations, and reservation sessions.
- Docker Compose also starts Redis for the local Lab2 stack, but this service currently does not read a Redis URL.

Owned MongoDB collections:

- `ai_conversations`
- `ai_lab_interpretations`
- `ai_reservation_sessions`
- `ai_dashboard_helper_sessions`

## Environment Keys

Copy `.env.example` to `.env`.

Service keys:

- `PORT`
- `NODE_ENV`
- `CORS_ORIGIN`
- `MONGODB_URI`
- `AI_PROVIDER_MODE`
- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`
- `AUTH_SERVICE_URL`
- `CORE_SERVICE_URL`
- `INTERNAL_API_KEY`
- `JWT_ACCESS_SECRET`
- `DASHBOARD_HELPER_KB_PATH` defaults to `docs/medsphere-role-portal-user-friendly-knowledge-base.txt`
- `MAX_AUDIO_FILE_SIZE_MB`
- `UPLOADS_DIR`
- `PUBLIC_BASE_URL`

Docker Compose helper keys:

- `MONGODB_PORT`
- `REDIS_PORT`
- `CORE_SERVICE_URL_DOCKER`
- `AUTH_SERVICE_URL_DOCKER`

Use `AI_PROVIDER_MODE=stub` for local development without OpenAI credentials. Use `AI_PROVIDER_MODE=openai` only when `OPENAI_API_KEY` is configured.

## Start Locally

```bash
npm install
cp .env.example .env
npm run dev
```

If you do not have local MongoDB running, start the Docker stack instead.

## Run With Docker

```bash
cp .env.example .env
npm run docker:up
npm run docker:logs
npm run docker:ps
```

Stop the stack:

```bash
npm run docker:down
```

Docker starts the AI service, MongoDB, and Redis. Inside Docker, MongoDB uses the service hostname `mongodb`, not `localhost`.

## Build And Tests

```bash
npm run build
npm run test
```

Additional commands:

```bash
npm run test:watch
npm run seed:lab
```

## Swagger

- Swagger UI: `http://localhost:3010/api/docs`
- OpenAPI JSON: `http://localhost:3010/api/docs.json`

Swagger covers health, capabilities, consultation transcription/summarization, consultation report approval/editing, lab interpretation, patient lab interpretation reads, internal lab interpretation queueing, reservation-agent messaging, and the dashboard-helper Socket.IO contract through the `Dashboard Helper Socket` tag plus the `x-socket-events.dashboardHelper` OpenAPI extension.

## Main Endpoints

- `GET /api/ai/capabilities`
- `POST /api/ai/transcribe`
- `POST /api/ai/summarize`
- `GET /api/ai/consultations/:appointmentId`
- `PUT /api/ai/consultations/:appointmentId/summary`
- `POST /api/ai/consultations/:appointmentId/approve`
- `POST /api/ai/lab-results/:labOrderId/interpret`
- `POST /api/ai/internal/lab-results/:labOrderId/interpret`
- `GET /api/ai/lab-results/:labOrderId/interpretation`
- `POST /api/ai/agent/message`
- Socket.IO `dashboard-helper:message` with server events `dashboard-helper:ready`, `dashboard-helper:typing`, `dashboard-helper:message`, and `dashboard-helper:error`

## Dashboard Helper Socket

The role-aware dashboard helper runs over Socket.IO on the AI service origin, for example `http://localhost:3010`. It uses the role-portal user-friendly knowledge base and answers only from the current role scope plus shared rules in that document.

Frontend handshake:

```ts
io(aiSocketUrl, { auth: { token: accessToken } });
```

Client event:

- `dashboard-helper:message` with `{ sessionId?, message, role, portalTitle?, patientId? }`

Server events:

- `dashboard-helper:ready`
- `dashboard-helper:typing` with `{ sessionId, isTyping }`
- `dashboard-helper:message` with the assistant reply
- `dashboard-helper:error`

The socket requires an authenticated user. Set `JWT_ACCESS_SECRET` to verify tokens locally, or set `AUTH_SERVICE_URL` so the service can verify the bearer token through `GET /api/auth/me`. The frontend must send the current role on every `dashboard-helper:message` event.

If the answer is not covered by the role-portal knowledge base, the helper responds with the configured fallback directing the user to `info@medsphere.com` or Contact Us on the website. If the question asks about another role or hidden screen, the helper responds that the role or permissions may not include that module.

For local development, `CORS_ORIGIN` accepts a comma-separated list, for example `http://localhost:3001,http://localhost:3002,http://localhost:5173`.
