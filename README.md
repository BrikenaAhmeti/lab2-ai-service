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

## Environment Keys

Copy `.env.example` to `.env`.

Service keys:

- `PORT`
- `NODE_ENV`
- `MONGODB_URI`
- `AI_PROVIDER_MODE`
- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`
- `CORE_SERVICE_URL`
- `INTERNAL_API_KEY`
- `MAX_AUDIO_FILE_SIZE_MB`
- `UPLOADS_DIR`
- `PUBLIC_BASE_URL`

Docker Compose helper keys:

- `MONGODB_PORT`
- `REDIS_PORT`
- `CORE_SERVICE_URL_DOCKER`

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

Swagger covers health, capabilities, consultation transcription/summarization, consultation report approval/editing, lab interpretation, patient lab interpretation reads, internal lab interpretation queueing, and reservation-agent messaging.

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
