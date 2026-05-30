# MedSphere AI Service

Setup for the MedSphere AI microservice. This repository is scoped only to the AI backend described in the PRD and Sprint 6 task board:

- MS-33: audio transcription and consultation summarization
- MS-34: lab result interpretation for clinical and patient-facing views
- MS-35: reservation agent conversation endpoint

The AI Service stores AI-generated data in MongoDB. It does not own PostgreSQL tables, Prisma migrations, departments, patients, appointments, or other Core Service domain data.

## Stack

- Node.js, Express, TypeScript
- MongoDB with Mongoose
- OpenAI provider boundary, with safe local `stub` mode by default
- Swagger/OpenAPI docs at `/api/docs`
- Jest and Supertest

## Project Structure

```text
src/
  app.ts
  server.ts
  config/env.ts
  infrastructure/
    ai/ai-provider.ts
    mongodb/mongoose.ts
  modules/ai/
    domain/ai.types.ts
    infrastructure/
      ai-conversation.model.ts
      ai-lab-interpretation.model.ts
      ai-reservation-session.model.ts
    presentation/ai.routes.ts
    services/
      consultation-ai.service.ts
      lab-interpretation-ai.service.ts
      reservation-agent.service.ts
  shared/
    core/
    http/
    middleware/
```

## Environment

Create `.env` from `.env.example`.

```env
PORT=3010
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/medsphere_ai
AI_PROVIDER_MODE=stub
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-4o
OPENAI_TRANSCRIPTION_MODEL=whisper-1
CORE_SERVICE_URL=http://localhost:4000
MAX_AUDIO_FILE_SIZE_MB=25
```

Use `AI_PROVIDER_MODE=stub` for local setup without API keys. Switch to `openai` only when `OPENAI_API_KEY` is configured.

OpenAI is only required when you want real AI output. The service runs without an
OpenAI key in `stub` mode, which returns deterministic placeholder
transcriptions, summaries, lab interpretations, and reservation-agent replies.
Use `AI_PROVIDER_MODE=openai` plus `OPENAI_API_KEY` for Whisper transcription and
GPT-powered summarization, lab interpretation, and reservation-agent responses.

## Endpoints

Base path: `/api/ai`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/capabilities` | Lists AI features from the sprint scope |
| POST | `/transcribe` | Multipart audio upload in field `audio` |
| POST | `/summarize` | Creates structured consultation summary |
| GET | `/consultations/:appointmentId` | Reads stored transcription and summary |
| POST | `/consultations/:appointmentId/approve` | Marks AI summary as approved |
| POST | `/lab-results/:labOrderId/interpret` | Creates clinical and patient lab interpretations |
| GET | `/lab-results/:labOrderId/interpretation` | Reads the MS-55 patient lab interpretation response |
| POST | `/agent/message` | Sends/continues reservation-agent message |

## MongoDB Collections

- `ai_conversations`
- `ai_lab_interpretations`
- `ai_reservation_sessions`

## Commands

```bash
npm install
npm run dev
npm run build
npm run test
```

Health check:

```bash
curl http://localhost:3010/health
```

Swagger/OpenAPI:

- Swagger UI: `http://localhost:3010/api/docs`
- OpenAPI JSON: `http://localhost:3010/api/docs.json`
- Postman collection: `docs/postman/medsphere-ai-service.postman_collection.json`

MS-55 lab interpretation response:

```json
{
  "labOrderId": "lab-123",
  "patientVersion": "Plain-language explanation for the patient.",
  "disclaimer": "AI-generated explanation - discuss results with your doctor.",
  "recommendations": ["Review the result with a licensed clinician."],
  "riskFlags": ["Glucose - moderate (180 mg/dL): Reference range: 70-99 mg/dL"]
}
```
