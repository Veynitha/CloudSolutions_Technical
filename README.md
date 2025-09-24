# Telemetry Ingestor (NestJS + MongoDB + Redis)

Minimal IoT telemetry backend: accepts JSON readings, stores in MongoDB, caches the latest per device in Redis, raises webhook alerts on threshold breaches, and exposes read/analytics APIs.

---

## Setup

### Prerequisites
- Node.js 18+
- MongoDB (local **or** Atlas)
- Redis (Docker is fine)

### 1) Clone & install
```bash
[git clone <your-repo-url> telemetry-ingestor](https://github.com/Veynitha/CloudSolutions_Technical.git)
cd telemetry-ingestor
npm install
```

### 2) Environment variables

Create a .env and use .env.example for reference.

```bash
# .env
MONGO_URI=mongodb://127.0.0.1:27017/telemetry
REDIS_URL=redis://127.0.0.1:6379
ALERT_WEBHOOK_URL=https://webhook.site/<your-uuid>   # replace with YOUR URL
INGEST_TOKEN=                                        
PORT=3000
LOG_LEVEL=log,error,warn,debug
NODE_ENV=development
```

### 3) Start Redis (Docker)

```bash
docker run -d --name redis -p 6379:6379 redis:7
```

### 4) Start MongoDB

Local: ensure mongod is running (the default URI above uses telemetry DB and a local connection).

Atlas: replace MONGO_URI with your Atlas SRV string, e.g.
```bash 
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>/telemetry?retryWrites=true&w=majority
```

### 5) Run the app

```bash
npm run start:dev
```

### Webhook endpoint (webhook.site): 

```bash
https://webhook.site/07ff9745-73d8-4fb6-ac5d-33ba77738c8f
```

### AI Assistance

- Drafted the module layout and build order (phases) and refined after local runs.

- Authored DTOs and Zod schemas (ISO validation, refinements).

- Implemented Redis dedup pattern (SET key NX EX 60) and explained atomicity.

- Wrote Mongo aggregation pipeline for site summary and empty-window handling.

- Suggested payload caps (100 KB), Helmet, and health check pings for ops readiness.

- Used for unit test generation


#### Note
Unit tests were created after code submission to abide with time constraints
