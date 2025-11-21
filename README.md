# Parking Platform - Ticket Issuance System

Multi-tenant parking facility ticket issuance system with real-time spot assignment and audit trail.

## Quick Start

For detailed setup instructions, see the [quickstart guide](specs/001-ticket-issuance/quickstart.md).

### Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- Node.js 20 LTS
- Git

### Setup

```bash
# 1. Clone and navigate to project
cd spec-kit-test

# 2. Install dependencies
npm install

# 3. Start infrastructure (PostgreSQL, Redis, Kafka)
cd docker
docker-compose up -d
cd ..

# 4. Configure environment
cp .env.example .env

# 5. Run database migrations
npm run prisma:generate
npm run db:migrate

# 6. Seed development data
npm run db:seed

# 7. Start development server
npm run dev
```

The API will be available at `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run all tests
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Check code quality
- `npm run format` - Format code with Prettier
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed development data
- `npm run db:studio` - Open Prisma Studio

## Architecture

### Bounded Contexts

- **Facility**: Manages parking facilities and spot availability
- **Ticketing**: Handles ticket issuance and lifecycle
- **Shared**: Common value objects and domain events

### Tech Stack

- **Runtime**: Node.js 20 LTS, TypeScript 5.3
- **API Framework**: Express.js 5.x
- **Database**: PostgreSQL 16 with Prisma ORM
- **Cache**: Redis 7
- **Event Bus**: Apache Kafka
- **Logging**: Winston
- **Testing**: Jest, Supertest, Testcontainers

## Project Structure

```
src/
├── api/              # HTTP server and routes
├── facility/         # Facility bounded context
├── ticketing/        # Ticketing bounded context
├── shared/           # Shared kernel
└── infrastructure/   # Infrastructure adapters

tests/
├── unit/            # Unit tests
├── integration/     # Integration tests
└── contract/        # Contract tests
```

## Key Features

- Multi-tenant isolation with defense-in-depth
- Real-time spot availability with Redis caching
- Pessimistic locking for concurrent spot assignment
- Immutable audit trail with 10-year retention
- Support for 6 vehicle types
- Event-driven architecture with Kafka
- Hardware abstraction for multiple ticket formats

## Documentation

- [Implementation Plan](specs/001-ticket-issuance/plan.md)
- [Feature Specification](specs/001-ticket-issuance/spec.md)
- [Data Model](specs/001-ticket-issuance/data-model.md)
- [API Contracts](specs/001-ticket-issuance/contracts/openapi.yaml)
- [Quickstart Guide](specs/001-ticket-issuance/quickstart.md)

## License

UNLICENSED - Private
