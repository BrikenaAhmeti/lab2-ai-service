# MedSphere AI Service

AI microservice for Lab2 MedSphere. It owns consultation audio transcription, consultation summary drafts, lab result interpretation, patient-facing lab explanations, reservation-agent conversations, dashboard-helper Socket.IO chat, and Vapi voice appointment tool proxying.

The service stores AI workflow data in MongoDB. It does not own PostgreSQL/Prisma domain data for patients, appointments, departments, billing, inventory, staff, or users.

## Port

- Local and Docker API: `http://localhost:3010`
- Container port: `3010`
- Health: `GET /health`
- REST API base path: `/api/ai`
- Static uploads: `/uploads`
- Swagger UI: `http://localhost:3010/api/docs`
- OpenAPI JSON: `http://localhost:3010/api/docs.json`
- Socket.IO origin: `http://localhost:3010`

## Data Store

- MongoDB via Mongoose for AI workflow/session data.
- Docker Compose also starts Redis for local Lab2 stack compatibility, but this service currently does not read a Redis URL.
- Vapi call-log endpoints read directly from the Vapi API and do not persist Vapi data locally.

Owned MongoDB collections:

- `ai_conversations`
- `ai_lab_interpretations`
- `ai_reservation_sessions`
- `ai_dashboard_helper_sessions`

## Environment

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
- `DASHBOARD_HELPER_KB_PATH`
- `MAX_AUDIO_FILE_SIZE_MB`
- `UPLOADS_DIR`
- `PUBLIC_BASE_URL`
- `VAPI_API_BASE_URL`
- `VAPI_PRIVATE_KEY`
- `VAPI_ASSISTANT_ID`

Docker helper keys:

- `MONGODB_PORT`
- `REDIS_PORT`
- `AUTH_SERVICE_URL_DOCKER`
- `CORE_SERVICE_URL_DOCKER`

`DASHBOARD_HELPER_KB_PATH` defaults to `docs/medsphere-role-portal-user-friendly-knowledge-base.txt`.

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

Docker starts the AI service, MongoDB, and Redis. Inside Docker, MongoDB uses the `mongodb` service hostname.

## Build And Tests

```bash
npm run build
npm run test
```

Additional commands:

```bash
npm run test:watch
npm run docker:logs
npm run docker:ps
npm run seed:lab
```

## Main Endpoints

Capabilities and consultation AI:

- `GET /api/ai/capabilities`
- `POST /api/ai/transcribe`
- `POST /api/ai/summarize`
- `GET /api/ai/consultations/:appointmentId`
- `PUT /api/ai/consultations/:appointmentId/summary`
- `POST /api/ai/consultations/:appointmentId/approve`

Lab AI:

- `POST /api/ai/lab-results/:labOrderId/interpret`
- `POST /api/ai/internal/lab-results/:labOrderId/interpret`
- `GET /api/ai/lab-results/:labOrderId/interpretation`

Reservation and Vapi:

- `POST /api/ai/agent/message`
- `POST /api/ai/vapi/tools`
- `GET /api/ai/vapi/calls`
- `GET /api/ai/vapi/calls/:id`
- `GET /api/ai/vapi/calls/:id/log`

Vapi call-log reads require a bearer JWT verified with `JWT_ACCESS_SECRET` and either Admin/Super Admin role or `audit_logs:read`. Vapi tools forward supported tool calls to Core through `POST /internal/appointments/vapi/tools`.

Swagger also documents the dashboard-helper Socket.IO contract through the `Dashboard Helper Socket` tag and `x-socket-events.dashboardHelper` extension.

## Dashboard Helper Socket

The role-aware dashboard helper runs over Socket.IO on the AI service origin. It answers from the role-portal user-friendly knowledge base and only within the current role scope plus shared rules in that document.

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

If an answer is not covered by the role-portal knowledge base, the helper uses the configured fallback and directs the user to support or Contact Us. If the question asks about another role or hidden screen, the helper explains that the role or permissions may not include that module.

## Integrations

- Auth verifies dashboard-helper sockets and current-user role/permission context.
- Core provides appointment clinical context, lab-order handoff, and Vapi appointment tools.
- OpenAI is used only when `AI_PROVIDER_MODE=openai`.
- Vapi is used for voice appointment call logs and tool-call handoff when Vapi keys are configured.

## Database Normalization

This service does not own a relational database, so relational 3NF is not applied inside AI. MongoDB document boundaries are kept per workflow:

- `ai_conversations` stores one consultation AI workflow per appointment.
- `ai_lab_interpretations` stores one AI interpretation per lab order.
- `ai_reservation_sessions` stores one reservation-agent conversation per session.
- `ai_dashboard_helper_sessions` stores one dashboard-helper conversation per authenticated user/session.

Core and Auth remain the normalized sources for patients, appointments, users, staff, departments, billing, and permissions. AI stores IDs and generated AI artifacts only, avoiding duplicated master records.

## Knowledge Base Maintenance

The dashboard helper knowledge base is `docs/medsphere-role-portal-user-friendly-knowledge-base.txt`. Keep it aligned with the current frontend portal routes and role navigation whenever dashboard screens, permissions, or role workflows change.

The parser scopes answers by numbered tables in that file, so preserve the existing table numbers unless the parser mappings in `src/infrastructure/ai/ai-provider.ts` are updated at the same time.
