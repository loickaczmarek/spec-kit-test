# Quickstart Guide: Ticket Issuance Development

**Feature**: 001-ticket-issuance
**Last Updated**: 2025-11-20

## Overview

This guide helps developers set up a local development environment for the ticket issuance feature. By the end of this guide, you'll have a running API server with PostgreSQL, Redis, and Kafka, ready for development and testing.

**Prerequisites**:
- Docker Desktop (or Docker Engine + Docker Compose)
- Node.js 20 LTS
- Git
- IDE with TypeScript support (VS Code recommended)

**Estimated Setup Time**: 15 minutes

---

## Step 1: Clone Repository

```bash
# Clone the repository (replace with actual repo URL)
git clone https://github.com/your-org/parking-platform.git
cd parking-platform

# Switch to the feature branch
git checkout 001-ticket-issuance
```

---

## Step 2: Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Verify installation
npm run verify  # Runs type checking and linting
```

**Expected Output**:
```
✓ TypeScript compilation successful
✓ ESLint checks passed
✓ Prettier formatting verified
```

---

## Step 3: Start Infrastructure Services

Start PostgreSQL, Redis, and Kafka using Docker Compose:

```bash
# Start all infrastructure services in the background
docker-compose up -d

# Verify services are running
docker-compose ps
```

**Expected Output**:
```
NAME                STATUS    PORTS
postgres            running   0.0.0.0:5432->5432
redis               running   0.0.0.0:6379->6379
kafka               running   0.0.0.0:9092->9092
zookeeper           running   0.0.0.0:2181->2181
```

**Service Details**:
- **PostgreSQL**: Database for tenants, facilities, spots, tickets
  - Host: `localhost:5432`
  - Database: `parking_platform`
  - User: `postgres`
  - Password: `postgres` (dev only)

- **Redis**: Cache for spot availability
  - Host: `localhost:6379`
  - No password (dev only)

- **Kafka**: Event bus for TicketIssued events
  - Bootstrap server: `localhost:9092`
  - Topic: `tickets.issued.v1` (auto-created)

---

## Step 4: Run Database Migrations

Initialize the database schema using Prisma:

```bash
# Generate Prisma client from schema
npx prisma generate

# Run migrations to create tables
npx prisma migrate dev --name init

# Verify tables created
npx prisma studio  # Opens web UI at http://localhost:5555
```

**Expected Tables**:
- `Tenant`
- `Facility`
- `Spot`
- `Ticket`
- `TicketAuditLog`

---

## Step 5: Seed Development Data

Load sample tenants, facilities, and spots for testing:

```bash
# Run seed script
npm run db:seed
```

**Sample Data Created**:
```
Tenant: "Test City" (ID: 550e8400-e29b-41d4-a716-446655440000)
├── Facility: "Main Garage" (ID: 7c9e6679-7425-40de-944b-e07fc1f90ae7)
│   ├── 50 CAR spots (A-001 to A-050)
│   ├── 10 MOTORCYCLE spots (M-001 to M-010)
│   ├── 10 ELECTRIC spots (E-001 to E-010)
│   ├── 5 TRUCK_BUS spots (T-001 to T-005)
│   ├── 5 ACCESSIBLE spots (H-001 to H-005)
│   └── 5 FAMILY spots (F-001 to F-005)
└── Facility: "Airport Lot" (ID: 8d0f7780-8536-51ef-a5d8-f18fc2g01bf8)
    └── Similar spot distribution
```

---

## Step 6: Start Development Server

Run the API server with hot reloading:

```bash
# Start development server
npm run dev
```

**Expected Output**:
```
[INFO] Server starting...
[INFO] Database connected: PostgreSQL 16
[INFO] Cache connected: Redis 7
[INFO] Event bus connected: Kafka (localhost:9092)
[INFO] Server listening on http://localhost:3000
[INFO] API Docs available at http://localhost:3000/api-docs
```

**API Endpoints**:
- Health Check: `GET http://localhost:3000/health`
- Issue Ticket: `POST http://localhost:3000/v1/facilities/{facility_id}/tickets`
- Check Availability: `GET http://localhost:3000/v1/facilities/{facility_id}/availability`
- OpenAPI Spec: `GET http://localhost:3000/api-docs`

---

## Step 7: Test the API

### Option A: Using cURL

```bash
# Get spot availability
curl -X GET \
  'http://localhost:3000/v1/facilities/7c9e6679-7425-40de-944b-e07fc1f90ae7/availability' \
  -H 'Authorization: Bearer test-token'

# Issue a ticket for a car
curl -X POST \
  'http://localhost:3000/v1/facilities/7c9e6679-7425-40de-944b-e07fc1f90ae7/tickets' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer test-token' \
  -d '{
    "vehicle_type": "voiture",
    "ticket_format": "magnetic_stripe"
  }'
```

**Expected Response** (201 Created):
```json
{
  "ticket_id": "3f333df6-90a4-4fda-8dd3-9485d27cee36",
  "facility_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "spot_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "spot_number": "A-001",
  "vehicle_type": "CAR",
  "issued_at": "2025-11-20T14:30:00Z",
  "barcode": "MAG|3f333df6-90a4-4fda-8dd3-9485d27cee36|A-001",
  "status": "ISSUED"
}
```

### Option B: Using Postman/Insomnia

Import the OpenAPI spec from `specs/001-ticket-issuance/contracts/openapi.yaml` to auto-generate requests.

### Option C: Using VS Code REST Client

Create `test.http` file:

```http
### Get availability
GET http://localhost:3000/v1/facilities/7c9e6679-7425-40de-944b-e07fc1f90ae7/availability
Authorization: Bearer test-token

### Issue ticket
POST http://localhost:3000/v1/facilities/7c9e6679-7425-40de-944b-e07fc1f90ae7/tickets
Content-Type: application/json
Authorization: Bearer test-token

{
  "vehicle_type": "voiture",
  "ticket_format": "magnetic_stripe"
}
```

---

## Step 8: Verify Event Publishing

Check that TicketIssued events are published to Kafka:

```bash
# Consume Kafka topic (opens new terminal)
docker exec -it kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic tickets.issued.v1 \
  --from-beginning
```

**Expected Event Output**:
```json
{
  "schema_version": "v1.TicketIssued",
  "event_id": "01J9...",
  "timestamp": "2025-11-20T14:30:00Z",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "facility_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "ticket_id": "3f333df6-90a4-4fda-8dd3-9485d27cee36",
  "spot_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "spot_number": "A-001",
  "vehicle_type": "CAR",
  "issued_at": "2025-11-20T14:30:00Z"
}
```

---

## Step 9: Run Tests

Execute the test suite to verify everything works:

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testPathPattern=unit           # Unit tests only
npm test -- --testPathPattern=integration    # Integration tests only
npm test -- --testPathPattern=contract       # Contract tests only

# Run tests with coverage
npm run test:coverage
```

**Expected Output**:
```
Test Suites: 15 passed, 15 total
Tests:       87 passed, 87 total
Snapshots:   0 total
Time:        12.345 s
Coverage:    85.2% statements, 82.1% branches, 90.4% functions, 84.8% lines
```

**Key Test Files**:
- `tests/unit/ticketing/TicketIssuanceService.test.ts`: Business logic tests
- `tests/integration/ticket-issuance-api.test.ts`: Full HTTP request/response tests
- `tests/contract/spot-locking.test.ts`: Concurrent access and pessimistic locking tests

---

## Development Workflow

### Daily Development

1. **Pull latest changes**:
   ```bash
   git pull origin 001-ticket-issuance
   npm install  # If dependencies changed
   ```

2. **Start infrastructure** (if stopped):
   ```bash
   docker-compose up -d
   ```

3. **Start dev server**:
   ```bash
   npm run dev
   ```

4. **Make code changes** - Hot reloading will restart server automatically

5. **Run tests** before committing:
   ```bash
   npm test
   npm run lint
   ```

### Database Schema Changes

If you modify the Prisma schema:

```bash
# Create new migration
npx prisma migrate dev --name your_migration_name

# Regenerate Prisma client
npx prisma generate
```

### Debugging

**VS Code Launch Configuration** (`.vscode/launch.json`):
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug API Server",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "dev"],
  "skipFiles": ["<node_internals>/**"],
  "env": {
    "LOG_LEVEL": "debug"
  }
}
```

**Logging Levels**:
- `error`: Only errors
- `warn`: Warnings + errors
- `info`: Normal operation (default)
- `debug`: Verbose logging (includes SQL queries)

Change log level via environment variable:
```bash
LOG_LEVEL=debug npm run dev
```

---

## Troubleshooting

### Issue: Docker containers won't start

**Symptoms**: `docker-compose up -d` fails with port conflicts

**Solution**:
```bash
# Check if ports are already in use
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :9092  # Kafka

# Stop conflicting services or change ports in docker-compose.yml
```

### Issue: Database connection refused

**Symptoms**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution**:
```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Issue: Prisma migration fails

**Symptoms**: `Error: P3009 Migration failed`

**Solution**:
```bash
# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# Rerun migrations
npx prisma migrate dev

# Reseed data
npm run db:seed
```

### Issue: Kafka consumer not receiving events

**Symptoms**: No events appear in Kafka console consumer

**Solution**:
```bash
# Verify Kafka is running
docker-compose ps kafka

# Check Kafka logs
docker-compose logs kafka

# Verify topic exists
docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092

# Recreate topic if missing
docker exec -it kafka kafka-topics --create \
  --topic tickets.issued.v1 \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1
```

### Issue: Tests fail with "Cannot find module"

**Symptoms**: `Error: Cannot find module 'src/...'`

**Solution**:
```bash
# Rebuild TypeScript
npm run build

# Clear Jest cache
npx jest --clearCache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## Environment Variables

Create `.env` file in project root (copy from `.env.example`):

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/parking_platform?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Kafka
KAFKA_BROKER="localhost:9092"

# API
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Auth (dev only - use secure secrets in production)
JWT_SECRET="dev-secret-change-in-production"
API_KEY_SALT="dev-salt-change-in-production"

# Feature Flags
ENABLE_TICKET_EXPIRATION=false  # Future feature
ENABLE_QR_CODE_FORMAT=false     # Future feature
ENABLE_NFC_FORMAT=false         # Future feature
```

---

## Next Steps

Once your development environment is running:

1. **Explore the codebase**:
   - `src/ticketing/` - Ticket issuance bounded context
   - `src/facility/` - Facility and spot management bounded context
   - `src/shared/` - Shared kernel (value objects, events)

2. **Review the implementation plan**:
   - `specs/001-ticket-issuance/plan.md` - Architecture decisions
   - `specs/001-ticket-issuance/data-model.md` - Database schema details
   - `specs/001-ticket-issuance/contracts/openapi.yaml` - API specification

3. **Start implementing tasks**:
   - Run `/speckit.tasks` to generate task breakdown
   - Tasks will be listed in `specs/001-ticket-issuance/tasks.md`

4. **Join the team channels**:
   - Slack: `#parking-platform-dev`
   - Code reviews: GitHub Pull Requests
   - Questions: Tag `@platform-team` in Slack

---

## Useful Commands Reference

```bash
# Infrastructure
docker-compose up -d                     # Start all services
docker-compose down                      # Stop all services
docker-compose down -v                   # Stop and remove volumes (full reset)
docker-compose logs -f [service]         # Tail service logs

# Database
npx prisma studio                        # Open database GUI
npx prisma migrate dev                   # Create/apply migration
npx prisma migrate reset                 # Reset database (WARNING: Deletes data)
npx prisma db seed                       # Seed development data

# Development
npm run dev                              # Start dev server with hot reload
npm run build                            # Build TypeScript to JavaScript
npm run start                            # Start production build
npm run lint                             # Run ESLint
npm run format                           # Run Prettier

# Testing
npm test                                 # Run all tests
npm run test:watch                       # Run tests in watch mode
npm run test:coverage                    # Run tests with coverage report
npm run test:unit                        # Unit tests only
npm run test:integration                 # Integration tests only
npm run test:contract                    # Contract tests only

# Kafka
# (Run from inside kafka container: docker exec -it kafka <command>)
kafka-topics --list                      # List topics
kafka-console-consumer                   # Consume messages
kafka-console-producer                   # Produce test messages
```

---

## Additional Resources

- **Prisma Docs**: https://www.prisma.io/docs
- **Express.js Guide**: https://expressjs.com/en/guide/routing.html
- **Jest Testing**: https://jestjs.io/docs/getting-started
- **Kafka.js**: https://kafka.js.org/docs/getting-started
- **OpenAPI Spec**: https://swagger.io/specification/

---

**Need Help?**
- Check the troubleshooting section above
- Search existing GitHub issues
- Ask in `#parking-platform-dev` Slack channel
- Contact `@platform-team` for urgent issues
