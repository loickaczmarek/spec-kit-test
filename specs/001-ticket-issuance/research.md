# Research: Technology Decisions for Ticket Issuance

**Feature**: 001-ticket-issuance
**Date**: 2025-11-20
**Status**: Completed

## Overview

This document captures the research, technology selections, and architectural decisions made during Phase 0 planning for the ticket issuance feature. All decisions align with constitutional principles and feature requirements.

---

## 1. Programming Language & Runtime

### Decision: TypeScript 5.3 with Node.js 20 LTS

**Rationale**:
- **Type Safety**: TypeScript's static typing prevents common runtime errors in multi-tenant contexts (tenant_id type mismatches, null reference errors)
- **Domain Modeling**: Strong type system supports value objects (TenantId, FacilityId, TicketId) and domain entities
- **Ecosystem**: Extensive library support for required infrastructure (Prisma ORM, Kafka.js, ioredis)
- **Developer Productivity**: Fast iteration with hot reloading, extensive tooling (ESLint, Prettier, TSC)
- **Performance**: Node.js event loop suitable for I/O-bound workloads (database queries, cache lookups, event publishing)
- **Team Familiarity**: Common skillset for backend engineers in European SaaS ecosystem

**Alternatives Considered**:
- **Java/Spring Boot**: Rejected - Higher memory footprint, slower startup times, more complex dependency injection framework
- **Go**: Rejected - Lacks mature DDD libraries, weaker ORM options compared to Prisma
- **Rust**: Rejected - Steeper learning curve, overkill for I/O-bound business logic, slower development velocity
- **Python/FastAPI**: Rejected - Dynamic typing increases multi-tenant safety risks, GIL limits concurrency

---

## 2. Web Framework

### Decision: Express.js 4.x

**Rationale**:
- **Simplicity**: Minimal, unopinionated framework allows custom bounded context structure
- **Middleware Ecosystem**: Rich middleware for tenant context extraction, request validation, error handling
- **Community**: Mature ecosystem with extensive documentation and troubleshooting resources
- **Flexibility**: No prescriptive structure - aligns with DDD bounded context organization
- **Performance**: Lightweight, suitable for 100+ concurrent requests per facility target

**Alternatives Considered**:
- **NestJS**: Rejected - Opinionated structure conflicts with custom bounded context organization, heavier framework
- **Fastify**: Rejected - Marginal performance gains not worth smaller ecosystem and team learning curve
- **Koa**: Rejected - Smaller middleware ecosystem, less mature than Express

---

## 3. Database & ORM

### Decision: PostgreSQL 16 with Prisma ORM

**Rationale**:

**PostgreSQL**:
- **ACID Compliance**: Strong transactional guarantees for atomic spot assignment + ticket creation
- **Row-Level Locking**: `SELECT FOR UPDATE` enables pessimistic locking required by constitution (FR-004)
- **JSONB Support**: Flexible storage for ticket metadata and event payloads
- **Multi-Tenancy**: Row-level security (RLS) policies can enforce tenant isolation at database level
- **Performance**: Excellent concurrency handling for 100+ concurrent ticket requests
- **Retention**: Mature partitioning and archival strategies for 10-year audit retention (SC-007)

**Prisma ORM**:
- **Type Safety**: Auto-generated TypeScript types from schema prevent query errors
- **Migrations**: Declarative schema migrations with version control
- **Multi-Schema**: Logical separation of bounded contexts within single database
- **Raw SQL**: Escape hatch for `SELECT FOR UPDATE` pessimistic locking
- **Connection Pooling**: Built-in PgBouncer integration for high concurrency

**Alternatives Considered**:
- **MySQL**: Rejected - Weaker transaction isolation defaults, less mature JSONB support
- **MongoDB**: Rejected - Document model unsuitable for relational ticket-spot-facility hierarchy, weak multi-document transactions
- **TypeORM**: Rejected - Less active maintenance, weaker TypeScript inference compared to Prisma
- **Sequelize**: Rejected - Weaker TypeScript support, more verbose API

---

## 4. Caching Layer

### Decision: Redis 7

**Rationale**:
- **Real-Time Availability**: Sub-millisecond reads for spot availability queries (SC-001: <3s response time)
- **Atomic Operations**: INCR/DECR for available spot counters with atomicity guarantees
- **TTL Support**: Automatic cache invalidation with configurable expiration
- **Pub/Sub**: Optional real-time notifications for availability changes (future enhancement)
- **Data Structures**: Hashes for facility metadata, sorted sets for availability rankings
- **Persistence**: AOF/RDB for cache warm-up on restart

**Cache Strategy**:
- **Write-Through**: Update cache synchronously on spot assignment to maintain real-time availability
- **Cache Invalidation**: Delete cached availability on any spot state change
- **Fallback**: Always query PostgreSQL if cache miss (source of truth)

**Alternatives Considered**:
- **Memcached**: Rejected - Lacks data structures (hashes, sets), no pub/sub support
- **In-Memory (Node.js Map)**: Rejected - Doesn't scale across multiple instances, no persistence
- **No Caching**: Rejected - Cannot meet <3s response time with PostgreSQL-only queries under 100+ concurrent load

---

## 5. Event Bus

### Decision: Apache Kafka (via Kafka.js client)

**Rationale**:
- **Immutability**: Append-only commit log aligns with audit trail requirement (FR-011)
- **Retention**: Configurable topic retention up to infinite (supports 10-year requirement in FR-012)
- **Durability**: Replicated partitions prevent event loss
- **Ordering**: Per-partition ordering guarantees for facility-scoped events
- **Scalability**: Handles 100k+ tickets/day across all tenants
- **Event Sourcing**: Natural fit for TicketIssued event stream
- **Backpressure**: Producer acknowledgments prevent overload

**Kafka.js Client**:
- **Native TypeScript**: Better type safety than kafkajs wrapper
- **Connection Pooling**: Efficient producer/consumer management
- **Compression**: Gzip/Snappy support reduces network overhead

**Alternatives Considered**:
- **RabbitMQ**: Rejected - Optimized for message queuing (transient), not event log (persistent). Weak long-term retention story
- **AWS EventBridge**: Rejected - Vendor lock-in, limited retention (90 days max without S3 archival)
- **NATS JetStream**: Rejected - Smaller ecosystem, less mature 10-year retention tooling
- **Database Outbox Pattern Only**: Rejected - Doesn't scale to 100k+ events/day without dedicated event bus

---

## 6. Logging & Observability

### Decision: Winston Logger with Structured JSON Logs

**Rationale**:
- **Structured Logging**: JSON format enables log aggregation and querying (tenant_id filtering)
- **Transports**: Multiple outputs (console, file, syslog) for dev and production
- **Log Levels**: Granular control (error, warn, info, debug) per environment
- **Correlation IDs**: Request tracing across bounded contexts
- **Performance**: Async logging prevents blocking I/O

**Observability Stack** (production deployment):
- **Logs**: Winston → Fluentd → Elasticsearch → Kibana
- **Metrics**: Prometheus + Grafana (request latency, spot assignment rate, cache hit ratio)
- **Tracing**: OpenTelemetry (optional future enhancement for distributed tracing)

**Alternatives Considered**:
- **Pino**: Rejected - Marginal performance gains not worth ecosystem differences
- **Bunyan**: Rejected - Less active maintenance than Winston
- **Console.log**: Rejected - Unstructured, no log levels, unsuitable for production

---

## 7. Testing Strategy

### Decision: Jest + Supertest + Testcontainers

**Rationale**:

**Jest**:
- **Unit Testing**: Fast isolated tests for domain logic (spot availability, ticket generation)
- **Mocking**: Built-in mocks for repositories, event publishers, ticket writers
- **Coverage**: Integrated coverage reporting (target: 80%+ for services)
- **TypeScript Support**: First-class ts-jest integration

**Supertest**:
- **API Testing**: HTTP assertions for ticket issuance endpoint (User Story 1, 2)
- **Integration Tests**: Full request/response cycle with real Express app

**Testcontainers**:
- **Contract Tests**: Real PostgreSQL + Redis containers for locking behavior verification (User Story 5)
- **Isolation**: Clean database state per test suite
- **CI/CD**: Docker-based, runs in GitHub Actions / GitLab CI

**Test Pyramid**:
- Unit: 70% (domain logic, services)
- Integration: 25% (API endpoints, database interactions)
- Contract: 5% (cross-context APIs, event schemas)

**Alternatives Considered**:
- **Mocha + Chai**: Rejected - More verbose than Jest, weaker TypeScript integration
- **Vitest**: Rejected - Newer tool, smaller ecosystem, not mature enough for production
- **Manual Mocks**: Rejected - Testcontainers provides realistic concurrency testing (pessimistic locking validation)

---

## 8. Hardware Abstraction for Ticket Writers

### Decision: Adapter Pattern with Interface Segregation

**Rationale**:
- **Interoperability**: Constitution VI requires support for magnetic stripe, QR, NFC (FR-008)
- **Encapsulation**: Isolates hardware-specific logic from ticket issuance business logic
- **Testability**: Mock TicketWriter interface in unit tests without real hardware
- **Extensibility**: Add new ticket formats without modifying core issuance service

**Interface Design**:
```typescript
interface TicketWriter {
  write(ticket: Ticket): Promise<TicketWriteResult>;
  supports(format: TicketFormat): boolean;
}
```

**Implementations**:
- **MagneticStripeWriter**: ISO 7811 encoding (current requirement)
- **QRCodeWriter**: Stub for future (FR-008 future support)
- **NFCWriter**: Stub for future (FR-008 future support)

**Alternatives Considered**:
- **Direct Hardware Integration**: Rejected - Tight coupling prevents testing and format extensibility
- **Strategy Pattern**: Rejected - Adapter more appropriate for external system integration
- **Plugin System**: Rejected - Over-engineering for 3 known formats

---

## 9. API Design

### Decision: RESTful API with OpenAPI 3.1 Specification

**Rationale**:
- **Industry Standard**: REST widely understood by terminal hardware vendors
- **Simplicity**: Resource-based design maps cleanly to domain entities (facilities, tickets)
- **Tooling**: OpenAPI enables contract-first development, auto-generated client SDKs
- **Versioning**: URL-based versioning (`/v1/facilities/{id}/tickets`) for backward compatibility
- **Content Negotiation**: JSON default, extensible to other formats (Constitution VI)

**Endpoint Design**:
- `POST /v1/facilities/{facility_id}/tickets` - Issue ticket (FR-016)
  - Request: `{ "vehicle_type": "voiture" }`
  - Response: `{ "ticket_id": "...", "spot_id": "...", "issued_at": "..." }` (FR-017)
  - Error: `{ "error": "NO_SPOTS_AVAILABLE", "message": "..." }` (FR-018)

**Alternatives Considered**:
- **GraphQL**: Rejected - Over-engineering for simple CRUD operations, adds query complexity
- **gRPC**: Rejected - Terminal hardware primarily HTTP-based, smaller ecosystem for IoT devices
- **SOAP**: Rejected - Legacy protocol, verbose XML, poor developer experience

---

## 10. Concurrency & Locking Strategy

### Decision: Pessimistic Row-Level Locking with PostgreSQL

**Rationale**:
- **Constitutional Requirement**: Real-Time State Management principle mandates pessimistic locking (FR-004)
- **Zero Duplicate Assignments**: `SELECT FOR UPDATE` guarantees no two transactions claim same spot (SC-004)
- **Deadlock Prevention**: Lock spots in consistent order (spot_id ASC) to prevent deadlocks
- **Transaction Scope**: Hold lock only during spot assignment, release after ticket creation commit

**Lock Flow**:
1. `BEGIN TRANSACTION`
2. `SELECT * FROM spots WHERE facility_id = ? AND vehicle_type = ? AND status = 'available' ORDER BY spot_id LIMIT 1 FOR UPDATE`
3. Validate spot still available (recheck after lock acquired)
4. Update spot status to 'occupied'
5. Insert ticket record
6. `COMMIT` (releases lock)

**Fallback**: If lock timeout (5 seconds), return `NO_SPOTS_AVAILABLE` error

**Alternatives Considered**:
- **Optimistic Locking**: Rejected - Version-based concurrency doesn't prevent race conditions, requires retry logic
- **Distributed Lock (Redis)**: Rejected - Adds network hop, doesn't integrate with database transaction
- **Advisory Locks**: Rejected - Less robust than row-level locks, manual lock management error-prone
- **Saga Pattern**: Rejected - Over-engineering for single-database transaction

---

## 11. Multi-Tenant Isolation Strategy

### Decision: Application-Level Tenant Scoping + Database Row-Level Security (RLS)

**Rationale**:
- **Defense in Depth**: Dual-layer protection (application + database) prevents cross-tenant data leaks
- **Application Layer**: Express middleware extracts `tenant_id` from JWT/API key, injects into request context
- **Repository Layer**: All queries auto-filter by `tenant_id` (Prisma middleware)
- **Database Layer**: PostgreSQL RLS policies enforce tenant isolation even if application bug bypasses filters
- **Audit Trail**: All queries logged with tenant context for compliance review

**Tenant Context Flow**:
1. API Gateway extracts `tenant_id` from JWT claims or API key
2. Express middleware attaches to `req.tenantId`
3. Repository methods implicitly filter: `WHERE tenant_id = req.tenantId`
4. PostgreSQL RLS validates: `CREATE POLICY tenant_isolation ON tickets USING (tenant_id = current_setting('app.tenant_id'))`

**Alternatives Considered**:
- **Separate Databases per Tenant**: Rejected - Operational complexity (1000+ databases), expensive, hard to query cross-tenant analytics
- **Schema per Tenant**: Rejected - Migration complexity, connection pool fragmentation
- **Application-Only Filtering**: Rejected - Single point of failure, no defense against SQL injection or ORM bugs
- **Database-Only RLS**: Rejected - Harder to test, less transparent error messages

---

## 12. Event Schema Versioning

### Decision: Semantic Versioning with Schema Registry

**Rationale**:
- **Backward Compatibility**: Constitution V requires versioned event schemas
- **Consumer Protection**: Old consumers continue working when new fields added
- **Schema Evolution**: Supports adding optional fields without breaking changes
- **Validation**: Kafka Schema Registry validates events before publishing

**Event Format**:
```typescript
interface TicketIssuedV1 {
  schema_version: "v1.TicketIssued";
  event_id: string;           // UUIDv7 for time-sortable ordering
  timestamp: string;          // ISO 8601
  tenant_id: string;
  facility_id: string;
  ticket_id: string;
  spot_id: string;
  vehicle_type: VehicleType;
}
```

**Versioning Rules**:
- **MAJOR**: Breaking changes (remove field, change type) - new topic `tickets.issued.v2`
- **MINOR**: Add optional field - same topic, increment schema version
- **PATCH**: Documentation only - no schema change

**Alternatives Considered**:
- **No Versioning**: Rejected - Constitution V mandates backward compatibility
- **Avro Schema Registry**: Rejected - Adds complexity, JSON schema sufficient for current scale
- **Protobuf**: Rejected - Requires code generation, JSON more human-readable for debugging
- **Event Type Suffix Versioning**: Rejected - Topic-based versioning cleaner for major changes

---

## 13. Deployment & Infrastructure

### Decision: Docker Containers with Kubernetes Orchestration

**Rationale**:
- **Isolation**: Each bounded context deployable as separate container (future microservice extraction)
- **Scalability**: Horizontal scaling via Kubernetes ReplicaSets (handle 100k+ tickets/day)
- **High Availability**: Multi-zone deployment for 99.9% uptime (SC-008)
- **CI/CD**: GitHub Actions builds Docker images, deploys to staging/production via Helm charts
- **Environment Parity**: Dev, staging, production use identical container images

**Infrastructure Components**:
- **API Service**: Node.js container (stateless, horizontally scalable)
- **PostgreSQL**: Managed service (AWS RDS, Azure Database, or self-hosted with replication)
- **Redis**: Managed service (AWS ElastiCache, Azure Cache) or Redis Cluster
- **Kafka**: Managed service (Confluent Cloud, AWS MSK) or self-hosted cluster

**Alternatives Considered**:
- **Serverless (AWS Lambda)**: Rejected - Cold starts violate <3s response time, stateful connections (Kafka, DB pool) inefficient
- **VM-Based Deployment**: Rejected - Slower deployments, harder to scale, less portable
- **Docker Compose Only**: Rejected - Not production-grade, no auto-scaling or self-healing
- **Bare Metal**: Rejected - Operational overhead, slow provisioning, poor resource utilization

---

## 14. Error Handling & Resilience

### Decision: Circuit Breaker + Retry with Exponential Backoff

**Rationale**:
- **Fault Tolerance**: Prevents cascading failures if Kafka or Redis unavailable
- **Graceful Degradation**: Continue issuing tickets even if event publishing temporarily fails (store-and-forward)
- **Retry Logic**: Exponential backoff with jitter for transient errors (network blips, lock timeouts)
- **Circuit Breaker**: Fail fast after N consecutive errors (prevent resource exhaustion)

**Error Categories**:
1. **Retriable**: Lock timeout, network timeout, Kafka unavailable → Retry 3x with backoff
2. **Non-Retriable**: No spots available, invalid vehicle type, tenant not found → Return error immediately
3. **Critical**: Database connection lost → Circuit breaker opens, return 503 Service Unavailable

**Outbox Pattern** (for event publishing resilience):
- If Kafka publish fails, write event to `outbox` table in same transaction
- Background worker polls outbox, retries publishing, deletes on success
- Guarantees at-least-once event delivery (consumers must be idempotent)

**Alternatives Considered**:
- **No Retry Logic**: Rejected - Transient errors cause unnecessary ticket issuance failures
- **Infinite Retries**: Rejected - Risk of request timeout, resource exhaustion
- **Synchronous Event Publishing Only**: Rejected - Event bus downtime blocks ticket issuance (violates 99.9% uptime SC-008)
- **Manual Error Recovery**: Rejected - Operational burden, slow resolution

---

## 15. Development Environment

### Decision: Docker Compose for Local Development

**Rationale**:
- **Consistency**: All developers use identical PostgreSQL, Redis, Kafka versions
- **Fast Onboarding**: `docker-compose up` starts full stack in <2 minutes
- **Testability**: Testcontainers use same Docker images as dev environment
- **Hot Reloading**: Volume mounts enable live code updates without container rebuild

**docker-compose.yml Services**:
- **postgres**: PostgreSQL 16 with pre-loaded schema
- **redis**: Redis 7 with default config
- **kafka**: Single-node Kafka + Zookeeper (Redpanda for lighter alternative)
- **api**: Node.js app with volume mount for `src/`

**Alternatives Considered**:
- **Local Installation**: Rejected - Version mismatches between developers, harder onboarding
- **Cloud Dev Environments**: Rejected - Network latency, cost, requires internet connectivity
- **Vagrant**: Rejected - Heavier than Docker, slower startup, less portable

---

## Summary Table

| Decision Area | Chosen Technology | Key Rationale |
|---------------|------------------|---------------|
| Language | TypeScript 5.3 + Node.js 20 | Type safety, domain modeling, ecosystem |
| Framework | Express.js 4.x | Simplicity, flexibility, middleware |
| Database | PostgreSQL 16 | ACID, row locking, retention, multi-tenancy |
| ORM | Prisma | Type safety, migrations, connection pooling |
| Cache | Redis 7 | Real-time reads, atomic ops, TTL |
| Event Bus | Apache Kafka | Immutability, retention, durability, ordering |
| Logging | Winston | Structured JSON, transports, async |
| Testing | Jest + Supertest + Testcontainers | Unit, API, contract testing |
| API Design | REST + OpenAPI 3.1 | Industry standard, simplicity, tooling |
| Concurrency | PostgreSQL `SELECT FOR UPDATE` | Zero duplicates, constitutional requirement |
| Multi-Tenancy | App-level + RLS | Defense in depth, audit compliance |
| Event Versioning | Semantic versioning + Schema Registry | Backward compatibility, validation |
| Deployment | Docker + Kubernetes | Scalability, HA, CI/CD |
| Resilience | Circuit breaker + Outbox pattern | Fault tolerance, graceful degradation |
| Dev Environment | Docker Compose | Consistency, fast onboarding, testability |

---

## Next Steps

Phase 0 research complete. Proceed to Phase 1:
1. Generate `data-model.md` from entities
2. Generate OpenAPI contracts in `/contracts/`
3. Create `quickstart.md` for developer onboarding
4. Update agent context with selected technologies
