# AIRA — AI-Powered Financial Analysis Platform

A NestJS-based microservice that automates stock analysis by combining real-time financial data, news headlines, and LLM-powered insights with robust retry and self-correction logic.

## Features

- **Real-time Financial Data** — Fetches stock data, metrics, and fundamentals via `yahoo-finance2`
- **News Integration** — Aggregates recent headlines from NewsAPI for sentiment context
- **LLM Analysis** — Uses OpenRouter API (GPT-3.5-Turbo) to synthesize financials + news into actionable recommendations
- **Job Queue** — BullMQ + Redis for async processing and background job management
- **Retry & Self-Correction** — Auto-retry failed analyses with exponential backoff; re-analyzes if confidence is below threshold (0.7)
- **Persistent Storage** — TypeORM + PostgreSQL for job history, results, and tracing
- **Type-Safe** — Full TypeScript with strict type checking; robust JSON parsing and validation
- **Hosted Live** — Deployed on AWS EC2 using Docker, available for testing without cloning

## Architecture

```
POST /analysis { ticker }
    ↓
AnalysisService.createJob() → Save to DB + enqueue job
    ↓
BullMQ Queue (Redis)
    ↓
AgentProcessor.handle()
    ├── FinancialsService.getFinancials() → Yahoo Finance
    ├── NewsService.getHeadlines() → NewsAPI
    └── LLMService.analyzeFinancials() → OpenRouter GPT-3.5
        ├── Retry on failure (3 attempts, exponential backoff)
        └── Self-correct if confidence < 0.7
    ↓
AnalysisJob.result = { analysis } + stepsTrace
    ↓
GET /analysis/:jobId/result → Return final report
```

## Prerequisites

- **Node.js** 18+ 
- **PostgreSQL** 13+ (for job history)
- **Redis** (for BullMQ queue)
- **API Keys:**
  - `OPENAI_API_KEY` — OpenRouter key (`sk-or-v1-...`)
  - `NEWS_API_KEY` — NewsAPI key for headlines

## Installation & Setup

### 0. Live API

A live deployment is available at: `http://51.21.171.3:3000/`

You can test the API directly without cloning the project.

### 1. Clone & Install

```bash
git clone <repo>
cd AIRA
npm install
```

### 2. Environment Configuration

Create `.env` in the project root:

```env
# Server
PORT=3000

# Database (PostgreSQL)
DB_HOST=127.0.0.1
DB_PORT=5433
POSTGRES_USER=aira
POSTGRES_PASSWORD=123456
DB_NAME=aira

# Cache & Queue (Redis)
REDIS_HOST=localhost
REDIS_PORT=6379

# LLM (OpenRouter)
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=gpt-3.5-turbo

# News
NEWS_API_KEY=...
```

### 3. Start Services

Ensure PostgreSQL and Redis are running, then:

```bash
npm run start:dev
```

Server will start on `http://localhost:3000`.

## API Endpoints

### Start Analysis

**POST /analysis**

Request:
```json
{ "ticker": "TSLA" }
```

Response:
```json
{
  "jobId": "uuid",
  "ticker": "TSLA",
  "status": "pending",
  "message": "Analysis started — poll /analysis/:jobId/status to track progress"
}
```

### Check Job Status

**GET /analysis/:jobId/status**

Response:
```json
{
  "jobId": "uuid",
  "ticker": "TSLA",
  "status": "running|completed|failed",
  "confidence": 0.85,
  "stepsTrace": [
    {
      "step": "fetch-financials",
      "status": "ok",
      "data": { "companyName": "Tesla Inc" },
      "timestamp": "2026-05-21T18:09:43Z"
    },
    ...
  ],
  "createdAt": "2026-05-21T18:09:43Z",
  "updatedAt": "2026-05-21T18:10:12Z"
}
```

### Get Final Result

**GET /analysis/:jobId/result**

Response (when `status: completed`):
```json
{
  "ticker": "TSLA",
  "companyName": "Tesla Inc",
  "summary": "Strong upward momentum with solid fundamentals...",
  "recommendation": "BUY",
  "confidence": 0.9,
  "reasoning": "Excellent growth metrics combined with positive sentiment...",
  "riskFactors": ["Market volatility", "Regulatory pressure"],
  "source": "LLM"
}
```

### Test LLM Directly (Synchronous)

**GET /analysis/test/llm/:ticker**

Response (immediate, synchronous):
```json
{
  "ticker": "TSLA",
  "companyName": "Tesla Inc",
  "summary": "...",
  "recommendation": "BUY",
  "confidence": 0.85,
  "reasoning": "...",
  "riskFactors": [...],
  "source": "LLM"
}
```

## Example Workflow

### 1. Start a job (async)

```bash
curl -X POST http://51.21.171.3:3000/analysis \
  -H "Content-Type: application/json" \
  -d '{"ticker":"TSLA"}'
```

Response:
```json
{ "jobId": "abc-123", "status": "pending", ... }
```

### 2. Poll status

```bash
curl http://51.21.171.3:3000/analysis/abc-123/status
```

Response (while processing):
```json
{ "status": "running", "stepsTrace": [...] }
```

### 3. Get result (when complete)

```bash
curl http://51.21.171.3:3000/analysis/abc-123/result
```

Response:
```json
{
  "ticker": "TSLA",
  "recommendation": "BUY",
  "confidence": 0.9,
  ...
}
```

## Core Modules

### LLMService (`src/analysis/service/llm.service.ts`)

Handles LLM communication with robust JSON extraction and normalization:
- **extractJson()** — Extracts JSON from fenced blocks or balanced-brace scanning
- **parseJson()** — Parses and validates JSON with error handling
- **normalizeAnalysis()** — Coerces model output (e.g., `confidence: "high"` → `0.9`) into strict `LLMAnalysisResponse` shape
- **isValidAnalysisResponse()** — Type guard with minimal `any` usage

### AgentProcessor (`src/analysis/processor/agent.processor.ts`)

Orchestrates the full analysis pipeline:
- Fetches financials and headlines in sequence
- Calls `LLMService.analyzeFinancials()` with **retry logic** (3 attempts, exponential backoff)
- Implements **self-correction** — if confidence < 0.7, re-analyzes with updated prompt
- Persists results and detailed step traces to database

### FinancialsService (`src/analysis/service/financials.service.ts`)

Fetches financial data from Yahoo Finance using `yahoo-finance2`:
- Handles authentication/crumb tokens
- Maps Yahoo API response to standardized `FinancialData` DTO via `FinancialDataMapper`

### NewsService (`src/analysis/service/news.service.ts`)

Fetches recent news headlines from NewsAPI:
- Filters by ticker + company name
- Returns article titles for LLM context

### AnalysisService & Queue

- Manages job lifecycle (create, find, update)
- Enqueues jobs to BullMQ for background processing

## Build & Deployment

This project is deployed live on AWS EC2 using Docker containers, with the backend running on an EC2 instance and PostgreSQL/Redis managed in Docker.

### Build

```bash
npm run build
```

Output compiled JS to `dist/`.

### Run Production

```bash
npm run start:prod
```

## Project Structure

```
src/
├── main.ts                         # Entry point
├── app.module.ts                   # Root module
├── analysis/
│   ├── analysis.controller.ts      # HTTP endpoints
│   ├── analysis.module.ts          # Feature module
│   ├── dto/
│   │   ├── create-analysis.dto.ts
│   │   ├── financial-data.dto.ts
│   │   └── llm-analysis.dto.ts
│   ├── entities/
│   │   └── analysis-job.entity.ts
│   ├── mappers/
│   │   └── financial-data.mapper.ts
│   ├── processor/
│   │   ├── agent.processor.ts
│   │   └── agent.processor.spec.ts
│   └── service/
│       ├── analysis.service.ts
│       ├── financials.service.ts
│       ├── news.service.ts
│       ├── llm.service.ts
│       └── llm.service.spec.ts
test/
├── app.e2e-spec.ts
└── jest-e2e.json
```

## Key Design Decisions

1. **Mapper Pattern** — `FinancialDataMapper` abstracts Yahoo Finance schema complexity
2. **Async Processing** — BullMQ decouples fast API response from slow LLM calls
3. **Robust JSON Handling** — Multi-strategy extraction (fenced blocks, balanced braces) + normalization handles inconsistent model outputs
4. **Retry + Self-Correction** — Exponential backoff and confidence-based re-analysis improve reliability
5. **Step Tracing** — Detailed `stepsTrace` array enables debugging and monitoring
6. **Type Safety** — TypeScript strict mode + type guards minimize runtime errors

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DB_HOST` | PostgreSQL host | `127.0.0.1` |
| `DB_PORT` | PostgreSQL port | `5433` |
| `POSTGRES_USER` | DB user | `aira` |
| `POSTGRES_PASSWORD` | DB password | `123456` |
| `DB_NAME` | Database name | `aira` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `OPENAI_API_KEY` | OpenRouter key | `sk-or-v1-...` |
| `OPENAI_BASE_URL` | LLM endpoint | `https://openrouter.ai/api/v1` |
| `OPENAI_MODEL` | LLM model | `gpt-3.5-turbo` |
| `NEWS_API_KEY` | NewsAPI key | `...` |

## Troubleshooting

### Jobs stuck in "pending"

1. Ensure Redis is running: `redis-cli ping` → should return `PONG`
2. Verify processor is loaded: check logs for `AgentProcessor` registration
3. Check database connection: `psql -U aira -d aira -c "SELECT 1"`

### LLM calls failing with 404

- Verify `OPENAI_BASE_URL` is `https://openrouter.ai/api/v1` (not `/v1`)
- Check `OPENAI_API_KEY` is valid and has credits

### Low confidence analyses

- The processor automatically re-analyzes if confidence < 0.7
- Check `stepsTrace` for `self-correction-attempt` steps
- Verify news headlines are being fetched correctly

## Contributing

1. Add tests for new logic
2. Ensure `npm run build` and `npm test` pass
3. Follow existing code style (ESLint + Prettier)

## License

UNLICENSED

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
