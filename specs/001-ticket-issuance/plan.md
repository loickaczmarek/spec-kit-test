# Implementation Plan: Émission de ticket à l'entrée

**Branch**: `001-ticket-issuance` | **Date**: 2025-11-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-ticket-issuance/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature implements a ticket issuance system for parking facility entry. When a driver arrives at an entry terminal and selects their vehicle type, the system atomically assigns an available parking spot, generates a unique ticket, writes it to magnetic stripe (with support for future QR/NFC formats), and publishes an immutable audit event. The system enforces multi-tenant isolation, prevents concurrent spot assignment conflicts using pessimistic locking, and maintains a 10-year audit trail for compliance.

**Technical Approach**: Event-driven microservices architecture using Node.js/TypeScript with separate bounded contexts for Ticketing and Facility Management. PostgreSQL for transactional consistency with row-level locking. Apache Kafka for event publishing. Redis for real-time spot availability caching. RESTful API with OpenAPI contracts.

## Technical Context

**Language/Version**: TypeScript 5.3 with Node.js 20 LTS
**Primary Dependencies**: Express.js (API), Prisma (ORM), Kafka.js (event bus), ioredis (caching), Winston (logging)
**Storage**: PostgreSQL 16 (primary), Redis 7 (cache layer)
**Testing**: Jest (unit/integration), Supertest (API), Testcontainers (contract/integration)
**Target Platform**: Linux server (Docker containers, Kubernetes deployment)
**Project Type**: Backend API service (bounded contexts as modules within monorepo)
**Performance Goals**: 100+ concurrent ticket requests/facility, <3s response time (SC-001), <200ms p95 for availability checks
**Constraints**: ACID transactions for spot assignment, pessimistic row locking, zero duplicate spot assignments (SC-004), 10-year event retention (SC-007)
**Scale/Scope**: Multi-tenant SaaS supporting multiple cities/providers, 1000+ facilities, 100k+ tickets/day across all tenants

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Multi-Tenant Isolation ✓

**Requirement**: Every feature MUST support multi-tenancy with strict data isolation. All queries, API endpoints, and background jobs MUST include tenant context filtering.

**Compliance**:
- Database schema includes `tenant_id` on Facility, Spot, and Ticket tables
- API endpoint validates tenant ownership of facility before ticket issuance (FR-013, FR-014)
- Spot availability queries scoped to facility → tenant hierarchy
- TicketIssued events include tenant_id for downstream tenant-aware processing

**Gate Status**: PASS - Multi-tenancy designed into data model and API contract from day one

---

### II. Real-Time State Management ✓

**Requirement**: Critical state transitions (entry, payment, exit) MUST use pessimistic locking or distributed consensus to prevent race conditions. Spot availability MUST be managed in real-time with atomic updates.

**Compliance**:
- PostgreSQL row-level pessimistic locking (SELECT FOR UPDATE) when claiming spots (FR-004, FR-015)
- Redis cache invalidation on spot state changes to maintain real-time availability view
- Transaction wraps spot assignment + ticket creation + availability update as atomic unit
- Prevents double-booking scenario outlined in User Story 5

**Gate Status**: PASS - Pessimistic locking strategy explicitly designed for concurrent access

---

### III. Audit & Compliance First ✓

**Requirement**: All ticket transactions MUST be immutably logged with complete audit trails. Ticket data MUST be retained for 10 years. Event sourcing for ticket lifecycle events.

**Compliance**:
- TicketIssued event published to Kafka (append-only, immutable) for every successful issuance (FR-010, FR-011)
- Kafka retention configured for 10-year compliance (FR-012)
- Event payload includes all required audit fields: ticket_id, facility_id, tenant_id, vehicle_type, spot_id, timestamp
- Separate audit log table (append-only) for ticket issuance operations

**Gate Status**: PASS - Event sourcing with immutable audit trail designed per constitutional requirement

---

### IV. Domain-Driven Design ✓

**Requirement**: Platform MUST organize around bounded contexts. Each context owns its data models and exposes well-defined contracts. Cross-context dependencies use integration events, not direct database access.

**Compliance**:
- **Ticketing Context**: Owns Ticket aggregate, ticket issuance logic, ticket validation rules
- **Facility Context**: Owns Facility and Spot aggregates, spot availability queries
- Ticketing context queries Facility context via internal API (not direct DB access)
- TicketIssued event allows other contexts (Analytics, Guidance) to react without coupling
- Shared kernel: TenantId, FacilityId, TicketId, SpotId value objects

**Gate Status**: PASS - Bounded contexts defined with clear ownership boundaries

---

### V. Event-Driven Architecture ✓

**Requirement**: State changes affecting multiple systems MUST use asynchronous events. Event schemas versioned and backward-compatible. Subscribers handle events idempotently.

**Compliance**:
- TicketIssued event published to Kafka after successful ticket creation (FR-010)
- Event schema versioned (v1.TicketIssued) with backward compatibility plan
- Downstream subscribers (Analytics, Guidance, Audit) process events asynchronously
- Ticket issuance operation does not block on subscriber processing (fail fast on event publish failure, retry mechanism)
- Idempotency: ticket_id as idempotency key prevents duplicate processing

**Gate Status**: PASS - Event-driven design with async event publishing post-transaction

---

### VI. Platform Interoperability ✓

**Requirement**: System MUST integrate with legacy magnetic stripe and modern QR/NFC alternatives. Hardware abstraction layer for ticket readers/writers. REST APIs with JSON.

**Compliance**:
- Adapter pattern for ticket writers: MagneticStripeWriter, QRCodeWriter, NFCWriter (FR-008)
- TicketWriter interface abstraction isolates hardware-specific logic
- API returns ticket data in JSON format; adapters handle physical encoding
- OpenAPI contract defines REST endpoint for ticket issuance (FR-016)

**Gate Status**: PASS - Adapter pattern designed for multi-format ticket support

---

### VII. Bounded Contexts ✓

**Requirement**: Enforce boundaries between Facility Operations (spot management), Ticketing (ticket lifecycle), Payment, Guidance, and Analytics. Each context evolves independently with stable public contracts.

**Compliance**:
- Facility context owns spot topology, availability status, entry/exit gate configuration
- Ticketing context owns ticket issuance, expiration policies (future), validation logic (future)
- Payment context out of scope for this feature (future integration via events)
- Guidance context out of scope for this feature (future subscriber to TicketIssued events)
- Analytics context future subscriber to TicketIssued events (read-only, no source schema dictation)

**Gate Status**: PASS - Bounded contexts identified and boundaries enforced via APIs and events

---

### Summary

**Overall Gate Status**: ✅ PASS - All constitutional principles satisfied. No violations requiring justification. Design aligns with multi-tenant, event-driven, domain-driven architecture mandated by constitution.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── shared/                      # Shared kernel (cross-context value objects)
│   ├── domain/
│   │   ├── TenantId.ts
│   │   ├── FacilityId.ts
│   │   ├── TicketId.ts
│   │   └── SpotId.ts
│   ├── events/
│   │   ├── DomainEvent.ts       # Base event class
│   │   └── EventPublisher.ts    # Kafka integration
│   └── middleware/
│       ├── tenantContext.ts     # Express middleware for tenant isolation
│       └── errorHandler.ts
│
├── facility/                    # Facility bounded context
│   ├── domain/
│   │   ├── Facility.ts          # Facility aggregate root
│   │   ├── Spot.ts              # Spot entity
│   │   └── VehicleType.ts       # Value object (enum)
│   ├── repositories/
│   │   ├── FacilityRepository.ts
│   │   └── SpotRepository.ts
│   ├── services/
│   │   └── SpotAvailabilityService.ts
│   └── api/
│       └── facilityRoutes.ts    # Internal API for cross-context queries
│
├── ticketing/                   # Ticketing bounded context
│   ├── domain/
│   │   ├── Ticket.ts            # Ticket aggregate root
│   │   └── TicketIssued.ts      # Domain event
│   ├── repositories/
│   │   └── TicketRepository.ts
│   ├── services/
│   │   └── TicketIssuanceService.ts
│   ├── adapters/
│   │   ├── TicketWriter.ts      # Interface
│   │   ├── MagneticStripeWriter.ts
│   │   ├── QRCodeWriter.ts      # Future implementation
│   │   └── NFCWriter.ts         # Future implementation
│   └── api/
│       └── ticketRoutes.ts      # Public API endpoint
│
├── infrastructure/              # Infrastructure adapters
│   ├── database/
│   │   ├── prisma/
│   │   │   └── schema.prisma    # Prisma schema with all contexts
│   │   └── migrations/
│   ├── cache/
│   │   └── RedisClient.ts
│   ├── events/
│   │   └── KafkaEventPublisher.ts
│   └── logging/
│       └── WinstonLogger.ts
│
└── api/                         # API gateway / entry point
    ├── app.ts                   # Express app setup
    ├── server.ts                # HTTP server bootstrap
    └── routes.ts                # Route aggregation

tests/
├── unit/
│   ├── facility/
│   │   └── SpotAvailabilityService.test.ts
│   └── ticketing/
│       └── TicketIssuanceService.test.ts
├── integration/
│   ├── ticket-issuance-api.test.ts
│   └── spot-locking.test.ts
└── contract/
    └── ticketing-api.contract.test.ts

docker/
├── Dockerfile
├── docker-compose.yml           # Local dev environment
└── docker-compose.test.yml      # Test environment with Testcontainers
```

**Structure Decision**: Modular monolith with bounded contexts organized as top-level modules (`facility/`, `ticketing/`). Each context follows clean architecture with domain models, repositories, services, and API layers. Shared kernel in `shared/` for cross-context value objects and infrastructure. Single Prisma schema with logical separation by table prefixes (e.g., `facility_spots`, `ticketing_tickets`). This structure allows future microservice extraction if needed while maintaining simplicity for initial implementation.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No violations to track** - All constitutional principles satisfied without requiring exceptions or complexity justifications.

---

## Post-Design Constitution Check Re-evaluation

*Phase 1 design artifacts (data model, API contracts, quickstart) have been completed. Re-checking constitutional compliance:*

### I. Multi-Tenant Isolation ✓ (Reconfirmed)

**Implementation Evidence**:
- Data model includes `tenant_id` on all bounded context tables (Tenant, Facility, Spot, Ticket, TicketAuditLog)
- OpenAPI contract documents tenant authorization check in 403 Forbidden response
- Prisma schema enforces foreign key constraints with `@relation` to Tenant
- Row-Level Security (RLS) policies documented in data-model.md for defense-in-depth
- Application middleware extracts tenant context from JWT/API key per quickstart.md

**Status**: PASS - Design artifacts demonstrate multi-tenant isolation at all layers

---

### II. Real-Time State Management ✓ (Reconfirmed)

**Implementation Evidence**:
- Data model documents pessimistic locking query using `SELECT FOR UPDATE NOWAIT` (data-model.md line 485)
- Spot.status enum supports atomic state transitions (AVAILABLE → OCCUPIED)
- Spot.version field enables optimistic locking fallback if needed
- Redis cache strategy documented with write-through invalidation (research.md section 4)
- Transaction wraps spot assignment + ticket creation + cache invalidation

**Status**: PASS - Design implements pessimistic locking per constitutional requirement

---

### III. Audit & Compliance First ✓ (Reconfirmed)

**Implementation Evidence**:
- TicketAuditLog table is append-only with immutable events (data-model.md line 230)
- Kafka topic `tickets.issued.v1` configured for 10-year retention (research.md section 5)
- Event schema includes all required audit fields (event_id, timestamp, tenant_id, facility_id, ticket_id, spot_id)
- TicketIssued event published after successful ticket creation (openapi.yaml documents sync flow)
- Retention policy documented with hot/warm/cold storage strategy (data-model.md line 502)

**Status**: PASS - Design satisfies 10-year immutable audit trail requirement

---

### IV. Domain-Driven Design ✓ (Reconfirmed)

**Implementation Evidence**:
- Bounded contexts clearly separated in source code structure (plan.md line 151-228)
  - Facility context: `src/facility/` with Facility and Spot aggregates
  - Ticketing context: `src/ticketing/` with Ticket aggregate
  - Shared kernel: `src/shared/` with TenantId, FacilityId, TicketId, SpotId value objects
- Each context has dedicated domain, repository, service, and API layers
- No cross-context foreign keys (only ID references)
- Integration events (TicketIssued) enable cross-context communication

**Status**: PASS - Design enforces bounded context boundaries per DDD principles

---

### V. Event-Driven Architecture ✓ (Reconfirmed)

**Implementation Evidence**:
- TicketIssued event schema versioned as v1.TicketIssued (data-model.md line 253)
- Event published to Kafka after transaction commit (async, non-blocking)
- Event includes idempotency key (event_id) for duplicate detection
- Kafka consumer behavior documented in data-model.md (Analytics, Guidance, Audit contexts)
- Outbox pattern documented for resilience if Kafka unavailable (research.md section 14)

**Status**: PASS - Design uses async events for cross-context communication

---

### VI. Platform Interoperability ✓ (Reconfirmed)

**Implementation Evidence**:
- TicketWriter adapter interface in source structure (`src/ticketing/adapters/`)
- Three implementations documented: MagneticStripeWriter, QRCodeWriter, NFCWriter
- OpenAPI contract supports ticket_format parameter (magnetic_stripe, qr_code, nfc)
- Barcode field in Ticket model supports multiple formats (max 500 chars)
- RESTful API with JSON responses (openapi.yaml)

**Status**: PASS - Design supports multi-format ticket encoding per constitutional requirement

---

### VII. Bounded Contexts ✓ (Reconfirmed)

**Implementation Evidence**:
- Facility context owns spot topology, availability queries (SpotAvailabilityService)
- Ticketing context owns ticket issuance logic (TicketIssuanceService)
- Payment context out of scope (future integration via TicketPaid event)
- Guidance context out of scope (future subscriber to TicketIssued events)
- Analytics context out of scope (future subscriber to TicketIssued events)
- Public contracts defined in OpenAPI spec (stable interface)

**Status**: PASS - Design respects bounded context boundaries and evolution independence

---

### Post-Design Summary

**Overall Gate Status**: ✅ PASS (Reconfirmed)

All seven constitutional principles remain satisfied after Phase 1 design. Implementation artifacts (data model, API contracts, development environment) align with architectural vision. No design decisions introduced violations or require justification.

**Phase 1 Complete** - Ready to proceed to Phase 2 (task generation via `/speckit.tasks`)
