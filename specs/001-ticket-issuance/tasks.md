# Tasks: Émission de ticket à l'entrée

**Feature Branch**: `001-ticket-issuance`
**Generated**: 2025-11-20
**Input**: Design documents from `/specs/001-ticket-issuance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: Tests are explicitly included based on the feature specification requiring tests for attribution, tenant isolation, and spot exhaustion.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `- [ ] [ID] [P?] [Story] Description`

- **Checkbox**: `- [ ]` (markdown checkbox)
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- **File paths**: Exact paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure per plan.md

- [ ] T001 Create project directory structure with bounded contexts (src/shared/, src/facility/, src/ticketing/, src/infrastructure/, src/api/, tests/)
- [ ] T002 Initialize Node.js 20 LTS project with TypeScript 5.3 and configure tsconfig.json
- [ ] T003 [P] Install core dependencies (Express 5.x, Prisma, KafkaJS, ioredis v5.4.0+, Winston)
- [ ] T004 [P] Configure ESLint and Prettier with TypeScript rules
- [ ] T005 [P] Setup Jest testing framework with ts-jest and Supertest
- [ ] T006 [P] Create Docker Compose file for PostgreSQL 16, Redis 7, and Kafka (docker/docker-compose.yml)
- [ ] T007 Configure environment variables template (.env.example) with DATABASE_URL, REDIS_URL, KAFKA_BROKER
- [ ] T008 Create README.md with quickstart reference pointing to specs/001-ticket-issuance/quickstart.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database & Schema

- [ ] T009 Create Prisma schema file at src/infrastructure/database/prisma/schema.prisma with all enums (TenantStatus, FacilityStatus, VehicleType, SpotStatus, TicketStatus, AuditEventType)
- [ ] T010 [P] Define Tenant model in Prisma schema with fields (id, name, slug, status, created_at) and indexes per data-model.md
- [ ] T011 [P] Define Facility model in Prisma schema with tenant relationship and indexes (tenant_id, status)
- [ ] T012 [P] Define Spot model in Prisma schema with composite index (facility_id, vehicle_type, status) and unique constraint (facility_id, spot_number)
- [ ] T013 [P] Define Ticket model in Prisma schema with indexes (tenant_id, facility_id, spot_id, issued_at, status)
- [ ] T014 [P] Define TicketAuditLog model in Prisma schema with JSONB metadata field and GIN index
- [ ] T015 Generate Prisma client and run initial migration to create all tables
- [ ] T016 Create database seed script (src/infrastructure/database/seed.ts) with sample tenant, facilities, and 85+ spots per facility

### Shared Kernel (Value Objects & Events)

- [ ] T017 [P] Implement TenantId value object with UUID validation in src/shared/domain/TenantId.ts
- [ ] T018 [P] Implement FacilityId value object in src/shared/domain/FacilityId.ts
- [ ] T019 [P] Implement TicketId value object with UUIDv7 support in src/shared/domain/TicketId.ts
- [ ] T020 [P] Implement SpotId value object in src/shared/domain/SpotId.ts
- [ ] T021 Create DomainEvent base class in src/shared/events/DomainEvent.ts
- [ ] T022 Implement EventPublisher with KafkaJS integration in src/shared/events/EventPublisher.ts (idempotent producer config from plan.md Implementation Guidelines)

### Infrastructure Adapters

- [ ] T023 [P] Create RedisClient wrapper in src/infrastructure/cache/RedisClient.ts with retry strategy from plan.md
- [ ] T024 [P] Create KafkaEventPublisher in src/infrastructure/events/KafkaEventPublisher.ts with transactionalId and maxInFlightRequests=1
- [ ] T025 [P] Configure Winston logger with structured JSON in src/infrastructure/logging/WinstonLogger.ts
- [ ] T026 [P] Create Prisma client singleton in src/infrastructure/database/PrismaClient.ts with connection pooling

### Express API Foundation

- [ ] T027 Create Express app setup in src/api/app.ts with JSON/URL-encoded body parsers
- [ ] T028 Implement tenant context middleware in src/shared/middleware/tenantContext.ts (extract tenant_id from JWT/API key per plan.md Implementation Guidelines)
- [ ] T029 [P] Implement async error handler wrapper in src/shared/middleware/asyncHandler.ts
- [ ] T030 [P] Implement global error handler with AppError class in src/shared/middleware/errorHandler.ts (4-parameter signature per plan.md)
- [ ] T031 Create HTTP server bootstrap in src/api/server.ts with graceful shutdown
- [ ] T032 Create health check endpoint in src/api/routes.ts (GET /health)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Entry with Available Parking Spot (Priority: P1) 🎯 MVP

**Goal**: Enable drivers to obtain tickets with assigned spots when entering a facility with available parking

**Independent Test**: Simulate vehicle arrival at facility with available spots → verify driver receives valid ticket with spot number

**User Story Reference**: spec.md lines 49-65 (6 acceptance scenarios for all vehicle types)

### Implementation for User Story 1

#### Facility Bounded Context (Spot Availability)

- [ ] T033 [P] [US1] Create Facility aggregate root in src/facility/domain/Facility.ts with tenant isolation enforcement
- [ ] T034 [P] [US1] Create Spot entity in src/facility/domain/Spot.ts with status transitions (AVAILABLE → OCCUPIED)
- [ ] T035 [P] [US1] Create VehicleType value object in src/facility/domain/VehicleType.ts with mapping from French input (voiture→CAR, moto→MOTORCYCLE, etc.)
- [ ] T036 [US1] Implement FacilityRepository in src/facility/repositories/FacilityRepository.ts with tenant-scoped queries
- [ ] T037 [US1] Implement SpotRepository in src/facility/repositories/SpotRepository.ts with pessimistic locking query (SELECT FOR UPDATE NOWAIT per plan.md line 150-178)
- [ ] T038 [US1] Implement SpotAvailabilityService in src/facility/services/SpotAvailabilityService.ts with Redis caching (write-through pattern per plan.md lines 279-347)

#### Ticketing Bounded Context (Ticket Issuance)

- [ ] T039 [P] [US1] Create Ticket aggregate root in src/ticketing/domain/Ticket.ts with UUIDv7 generation
- [ ] T040 [P] [US1] Create TicketIssued domain event in src/ticketing/domain/TicketIssued.ts with schema v1 per data-model.md lines 218-231
- [ ] T041 [US1] Implement TicketRepository in src/ticketing/repositories/TicketRepository.ts with tenant filtering
- [ ] T042 [US1] Implement TicketIssuanceService in src/ticketing/services/TicketIssuanceService.ts with transaction retry logic (executeWithRetry from plan.md lines 183-202)
- [ ] T043 [US1] Integrate spot assignment with ticket creation in atomic Prisma transaction (ReadCommitted isolation, 5s timeout per plan.md lines 176-178)

#### Ticket Writer Adapters (Hardware Abstraction)

- [ ] T044 [P] [US1] Create TicketWriter interface in src/ticketing/adapters/TicketWriter.ts with write() and supports() methods
- [ ] T045 [P] [US1] Implement MagneticStripeWriter in src/ticketing/adapters/MagneticStripeWriter.ts with ISO 7811 format stub
- [ ] T046 [P] [US1] Create QRCodeWriter stub in src/ticketing/adapters/QRCodeWriter.ts (future implementation)
- [ ] T047 [P] [US1] Create NFCWriter stub in src/ticketing/adapters/NFCWriter.ts (future implementation)

#### API Endpoint & Integration

- [ ] T048 [US1] Create ticket routes in src/ticketing/api/ticketRoutes.ts with POST /v1/facilities/:facility_id/tickets endpoint
- [ ] T049 [US1] Implement request validation for IssueTicketRequest (vehicle_type required, ticket_format optional per openapi.yaml)
- [ ] T050 [US1] Wire up tenant context middleware → SpotAvailabilityService → TicketIssuanceService → TicketWriter → EventPublisher flow
- [ ] T051 [US1] Publish TicketIssued event to Kafka topic "tickets.issued.v1" after successful transaction (async with outbox fallback per plan.md lines 241-269)
- [ ] T052 [US1] Implement success response with ticket details (ticket_id, spot_id, spot_number, vehicle_type, issued_at, barcode, status)

### Testing for User Story 1

- [ ] T053 [P] [US1] Create integration test for car ticket issuance in tests/integration/ticket-issuance-car.test.ts (verify spot assigned, ticket returned, event published)
- [ ] T054 [P] [US1] Create integration test for motorcycle ticket issuance in tests/integration/ticket-issuance-motorcycle.test.ts
- [ ] T055 [P] [US1] Create integration test for electric vehicle ticket issuance in tests/integration/ticket-issuance-electric.test.ts
- [ ] T056 [P] [US1] Create integration test for accessible spot ticket issuance in tests/integration/ticket-issuance-accessible.test.ts
- [ ] T057 [P] [US1] Create integration test for family spot ticket issuance in tests/integration/ticket-issuance-family.test.ts
- [ ] T058 [P] [US1] Create integration test for truck/bus spot ticket issuance in tests/integration/ticket-issuance-truck.test.ts
- [ ] T059 [US1] Create unit test for TicketIssuanceService in tests/unit/ticketing/TicketIssuanceService.test.ts (mock repositories, verify transaction logic)
- [ ] T060 [US1] Create unit test for SpotAvailabilityService in tests/unit/facility/SpotAvailabilityService.test.ts (verify cache hit/miss behavior)

**Checkpoint**: User Story 1 complete - drivers can obtain tickets with assigned spots for all 6 vehicle types

---

## Phase 4: User Story 2 - Entry with No Available Spots (Priority: P2)

**Goal**: Reject ticket requests when no spots available for requested vehicle type with clear error messaging

**Independent Test**: Simulate vehicle arrival at facility with all spots occupied → verify driver receives clear rejection message (409 Conflict)

**User Story Reference**: spec.md lines 68-81 (3 acceptance scenarios for different vehicle types)

### Implementation for User Story 2

- [ ] T061 [US2] Update SpotAvailabilityService to return null when no available spots found (no throw during query)
- [ ] T062 [US2] Update TicketIssuanceService to throw NoSpotsAvailableError when SpotAvailabilityService returns null
- [ ] T063 [US2] Create NoSpotsAvailableError class in src/shared/errors/NoSpotsAvailableError.ts extending AppError with 409 status code
- [ ] T064 [US2] Update ticket routes error handler to map NoSpotsAvailableError to 409 Conflict response with error code "NO_SPOTS_AVAILABLE"
- [ ] T065 [US2] Implement error response format per openapi.yaml (error field with message "Aucune place disponible pour type véhicule: {type}")

### Testing for User Story 2

- [ ] T066 [P] [US2] Create integration test for car rejection in tests/integration/ticket-rejection-car.test.ts (mark all car spots OCCUPIED, verify 409 response)
- [ ] T067 [P] [US2] Create integration test for motorcycle rejection in tests/integration/ticket-rejection-motorcycle.test.ts
- [ ] T068 [P] [US2] Create integration test for electric rejection in tests/integration/ticket-rejection-electric.test.ts
- [ ] T069 [US2] Create unit test for NoSpotsAvailableError handling in tests/unit/ticketing/TicketIssuanceService-rejection.test.ts

**Checkpoint**: User Story 2 complete - system properly rejects entries when facility full for requested vehicle type

---

## Phase 5: User Story 3 - Multi-Tenant Isolation (Priority: P1)

**Goal**: Enforce tenant isolation to prevent cross-tenant data access in ticket issuance and spot queries

**Independent Test**: Create facilities for different tenants → verify spot queries and ticket issuance never cross tenant boundaries

**User Story Reference**: spec.md lines 84-97 (3 acceptance scenarios for tenant isolation)

### Implementation for User Story 3

- [ ] T070 [US3] Update FacilityRepository to enforce WHERE tenant_id = {currentTenantId} filter on all facility queries
- [ ] T071 [US3] Update SpotRepository to join through Facility and filter by tenant_id in availability queries
- [ ] T072 [US3] Update TicketRepository to filter by tenant_id in all ticket queries
- [ ] T073 [US3] Add tenant ownership validation in ticket routes (verify facility.tenant_id matches req.tenantId before ticket issuance, return 403 Forbidden if mismatch)
- [ ] T074 [US3] Implement Prisma middleware in src/infrastructure/database/PrismaClient.ts to auto-inject tenant_id filter on all Ticket, Facility queries

### Testing for User Story 3

- [ ] T075 [P] [US3] Create integration test for cross-tenant facility access in tests/integration/tenant-isolation-facility.test.ts (Tenant A tries to access Tenant B's facility → 403)
- [ ] T076 [P] [US3] Create integration test for spot availability isolation in tests/integration/tenant-isolation-spots.test.ts (Tenant A full, Tenant B available → Tenant A request rejected without considering B's spots)
- [ ] T077 [P] [US3] Create integration test for ticket isolation in tests/integration/tenant-isolation-tickets.test.ts (verify tickets include correct tenant_id and queries filtered by tenant)
- [ ] T078 [US3] Create unit test for tenant context middleware in tests/unit/shared/tenantContext.test.ts (verify API key → tenant_id extraction)

**Checkpoint**: User Story 3 complete - multi-tenant isolation enforced at application and repository layers

---

## Phase 6: User Story 4 - Ticket Uniqueness and Audit Trail (Priority: P2)

**Goal**: Ensure unique ticket IDs and immutable audit trail with 10-year retention

**Independent Test**: Issue multiple tickets → verify each has unique ID, all events recorded immutably, and queryable for 10 years

**User Story Reference**: spec.md lines 100-114 (4 acceptance scenarios for uniqueness and audit)

### Implementation for User Story 4

- [ ] T079 [US4] Update Ticket aggregate to use UUIDv7 for time-sortable ticket IDs (already in T039, verify implementation)
- [ ] T080 [US4] Create TicketAuditLog entity in src/ticketing/domain/TicketAuditLog.ts (append-only, immutable)
- [ ] T081 [US4] Implement TicketAuditLogRepository in src/ticketing/repositories/TicketAuditLogRepository.ts (INSERT only, no UPDATE/DELETE methods)
- [ ] T082 [US4] Update TicketIssuanceService to write TicketAuditLog entry with event_type=ISSUED in same transaction as Ticket creation
- [ ] T083 [US4] Implement Kafka event publishing with idempotency key (event_id as deduplication key per data-model.md line 238)
- [ ] T084 [US4] Configure Kafka topic "tickets.issued.v1" retention policy for 10 years (in docker-compose.yml or production Kafka config)
- [ ] T085 [US4] Implement audit log query endpoint GET /v1/audit/tickets/:ticket_id/events in src/ticketing/api/auditRoutes.ts

### Testing for User Story 4

- [ ] T086 [P] [US4] Create integration test for ticket ID uniqueness in tests/integration/ticket-uniqueness.test.ts (issue 100 tickets concurrently, verify all IDs unique)
- [ ] T087 [P] [US4] Create integration test for audit trail in tests/integration/ticket-audit-trail.test.ts (issue ticket → query audit log → verify immutable TicketAuditLog entry exists)
- [ ] T088 [P] [US4] Create integration test for event publishing in tests/integration/ticket-event-publishing.test.ts (issue ticket → consume Kafka topic → verify TicketIssued event received with correct schema v1)
- [ ] T089 [US4] Create unit test for TicketAuditLogRepository in tests/unit/ticketing/TicketAuditLogRepository.test.ts (verify no update/delete methods, INSERT only)

**Checkpoint**: User Story 4 complete - all tickets have unique IDs, audit trail is immutable and queryable

---

## Phase 7: User Story 5 - Concurrent Spot Assignment (Priority: P3)

**Goal**: Prevent race conditions and duplicate spot assignments under concurrent load using pessimistic locking

**Independent Test**: Simulate concurrent ticket requests → verify zero duplicate spot assignments and atomic availability updates

**User Story Reference**: spec.md lines 117-130 (3 acceptance scenarios for concurrency)

### Implementation for User Story 5

- [ ] T090 [US5] Verify pessimistic locking implementation in SpotRepository (SELECT FOR UPDATE NOWAIT already in T037, ensure NOWAIT flag for fail-fast)
- [ ] T091 [US5] Implement transaction retry with exponential backoff in TicketIssuanceService for lock timeout errors (P2034, 40001 error codes per plan.md lines 183-202)
- [ ] T092 [US5] Add circuit breaker for database connection failures (fail fast after 3 consecutive errors, return 503 Service Unavailable)
- [ ] T093 [US5] Implement Redis cache invalidation via Pub/Sub for distributed instances (invalidate spot availability cache after spot assignment per plan.md lines 327-347)

### Testing for User Story 5

- [ ] T094 [US5] Create contract test for concurrent ticket requests in tests/contract/concurrent-spot-assignment.test.ts using Testcontainers (simulate 10 concurrent requests for facility with 1 available spot → verify only 1 succeeds, 9 get 409 Conflict)
- [ ] T095 [US5] Create contract test for pessimistic locking in tests/contract/pessimistic-locking.test.ts (verify lock acquisition blocks concurrent transactions)
- [ ] T096 [US5] Create load test for 100 concurrent requests per facility in tests/contract/load-test-concurrent.test.ts (verify no duplicate assignments, verify <3s response time per SC-001)
- [ ] T097 [US5] Create unit test for transaction retry logic in tests/unit/ticketing/TicketIssuanceService-retry.test.ts (mock P2034 error → verify retry with backoff)

**Checkpoint**: User Story 5 complete - system handles concurrent load with zero duplicate assignments

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and production readiness

### Documentation & Developer Experience

- [ ] T098 [P] Update README.md with architecture overview and bounded context diagram
- [ ] T099 [P] Verify quickstart.md instructions work end-to-end (docker-compose up → seed → test API call)
- [ ] T100 [P] Generate API documentation from OpenAPI spec and host at /api-docs endpoint using swagger-ui-express

### Observability & Monitoring

- [ ] T101 [P] Add structured logging for ticket issuance events (ticket_id, tenant_id, facility_id, vehicle_type, duration_ms)
- [ ] T102 [P] Add Prometheus metrics for ticket issuance rate, cache hit ratio, spot assignment duration
- [ ] T103 [P] Add correlation IDs to all requests for distributed tracing (X-Request-ID header)

### Performance Optimization

- [ ] T104 [P] Optimize spot availability query with materialized view for aggregate counts by facility and vehicle type
- [ ] T105 [P] Implement Redis connection pooling for high concurrency (ioredis cluster mode per plan.md line 283)
- [ ] T106 [P] Add database query logging in debug mode (log all SQL queries with duration >100ms)

### Security Hardening

- [ ] T107 [P] Implement rate limiting on ticket issuance endpoint (max 10 requests/minute per tenant per facility)
- [ ] T108 [P] Add input sanitization for vehicle_type and ticket_format parameters (reject invalid enum values with 400 Bad Request)
- [ ] T109 [P] Implement PostgreSQL Row-Level Security (RLS) policies for defense-in-depth tenant isolation per data-model.md lines 434-448

### Error Handling & Resilience

- [ ] T110 [P] Implement outbox pattern for failed event publishing (write to outbox table, background worker retries per plan.md lines 370-374)
- [ ] T111 [P] Add health checks for PostgreSQL, Redis, and Kafka connections (update /health endpoint with dependency status)
- [ ] T112 [P] Implement graceful shutdown (drain requests, close connections, flush logs)

### Additional Testing

- [ ] T113 [P] Create unit tests for VehicleType value object in tests/unit/facility/VehicleType.test.ts (verify French→English mapping)
- [ ] T114 [P] Create unit tests for all value objects (TenantId, FacilityId, TicketId, SpotId) in tests/unit/shared/
- [ ] T115 [P] Create integration test for idempotency key handling in tests/integration/ticket-idempotency.test.ts (same idempotency key → returns existing ticket without creating new one)
- [ ] T116 [P] Create smoke test suite in tests/smoke/ that can run against production (health check, issue ticket, verify event published)

### Code Quality

- [ ] T117 [P] Run full test suite and verify 80%+ code coverage (npm run test:coverage)
- [ ] T118 [P] Fix all TypeScript strict mode errors and enable strict: true in tsconfig.json
- [ ] T119 [P] Run ESLint and fix all warnings (npm run lint:fix)
- [ ] T120 Run full quickstart.md validation from fresh clone (docker-compose up → seed → dev server → test all 6 vehicle types)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3 - P1)**: Depends on Foundational phase - No dependencies on other stories - **This is the MVP**
- **User Story 2 (Phase 4 - P2)**: Depends on Foundational phase - Extends US1 error handling but independently testable
- **User Story 3 (Phase 5 - P1)**: Depends on Foundational phase - Can run parallel to US1/US2 but critical for multi-tenant SaaS
- **User Story 4 (Phase 6 - P2)**: Depends on Foundational phase - Extends US1 with audit trail but independently testable
- **User Story 5 (Phase 7 - P3)**: Depends on Foundational phase - Hardens US1 for concurrent load but independently testable
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1) - Entry with Available Spot**: FOUNDATIONAL for feature - must complete first for MVP
- **User Story 2 (P2) - No Available Spots**: Depends on US1 implementation → extends with error case
- **User Story 3 (P1) - Multi-Tenant Isolation**: Can start after Foundational → critical for SaaS but parallel to US1/US2
- **User Story 4 (P2) - Audit Trail**: Depends on US1 ticket creation → extends with audit log
- **User Story 5 (P3) - Concurrent Assignment**: Depends on US1 spot assignment → hardens with locking

### Parallel Opportunities

**Within Setup (Phase 1)**:
- T003, T004, T005, T006 can all run in parallel (different dependency types and files)

**Within Foundational (Phase 2)**:
- T010-T014 (Prisma models) can all run in parallel
- T017-T020 (value objects) can all run in parallel
- T023-T026 (infrastructure adapters) can all run in parallel
- T029-T030 (middleware) can run in parallel

**Across User Stories** (after Foundational complete):
- US1 and US3 can run in parallel (different concerns - core issuance vs. tenant isolation)
- Once US1 complete: US2, US4, US5 can run in parallel by different developers

**Within Each User Story**:
- Models/entities marked [P] can run in parallel
- Tests marked [P] can run in parallel
- Adapter implementations marked [P] can run in parallel

---

## Parallel Execution Examples

### Example 1: Setup Phase (4 parallel tasks)

```bash
# Developer A:
Task T003: "Install core dependencies (Express 5.x, Prisma, KafkaJS, ioredis v5.4.0+, Winston)"

# Developer B:
Task T004: "Configure ESLint and Prettier with TypeScript rules"

# Developer C:
Task T005: "Setup Jest testing framework with ts-jest and Supertest"

# Developer D:
Task T006: "Create Docker Compose file for PostgreSQL 16, Redis 7, and Kafka"
```

### Example 2: Foundational Phase - Prisma Models (5 parallel tasks)

```bash
# Developer A:
Task T010: "Define Tenant model in Prisma schema"

# Developer B:
Task T011: "Define Facility model in Prisma schema"

# Developer C:
Task T012: "Define Spot model in Prisma schema"

# Developer D:
Task T013: "Define Ticket model in Prisma schema"

# Developer E:
Task T014: "Define TicketAuditLog model in Prisma schema"
```

### Example 3: User Story 1 - Entities (4 parallel tasks)

```bash
# Developer A:
Task T033: "[US1] Create Facility aggregate root in src/facility/domain/Facility.ts"

# Developer B:
Task T034: "[US1] Create Spot entity in src/facility/domain/Spot.ts"

# Developer C:
Task T035: "[US1] Create VehicleType value object in src/facility/domain/VehicleType.ts"

# Developer D:
Task T039: "[US1] Create Ticket aggregate root in src/ticketing/domain/Ticket.ts"
```

### Example 4: User Story 1 - Tests (6 parallel tests)

```bash
# Developer A:
Task T053: "[US1] Integration test for car ticket issuance"

# Developer B:
Task T054: "[US1] Integration test for motorcycle ticket issuance"

# Developer C:
Task T055: "[US1] Integration test for electric vehicle ticket issuance"

# Developer D:
Task T056: "[US1] Integration test for accessible spot ticket issuance"

# Developer E:
Task T057: "[US1] Integration test for family spot ticket issuance"

# Developer F:
Task T058: "[US1] Integration test for truck/bus spot ticket issuance"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 3)

**Why US1 + US3 for MVP**:
- US1 delivers core value (drivers get tickets)
- US3 is critical for multi-tenant SaaS (both marked P1 priority)
- Together they form minimal viable product for production

**Steps**:
1. Complete Phase 1: Setup (T001-T008)
2. Complete Phase 2: Foundational (T009-T032) - **CRITICAL BLOCKER**
3. Complete Phase 3: User Story 1 (T033-T060) - Core ticket issuance
4. Complete Phase 5: User Story 3 (T070-T078) - Multi-tenant isolation
5. **STOP and VALIDATE**: Test both stories independently
6. Run integration tests end-to-end
7. Deploy to staging for demo

**Estimated MVP**: ~45-50 tasks, ~2-3 weeks for small team

### Incremental Delivery (Full Feature)

1. **Foundation** (T001-T032): Setup + Foundational → ~8-10 tasks/week
2. **MVP Release** (T033-T060 + T070-T078): US1 + US3 → Test → Deploy
3. **Error Handling** (T061-T069): US2 → Test → Deploy (handles facility full case)
4. **Audit Compliance** (T079-T089): US4 → Test → Deploy (10-year retention)
5. **Production Hardening** (T090-T097): US5 → Test → Deploy (concurrent load)
6. **Polish** (T098-T120): Documentation, monitoring, security → Final production release

**Total Estimated Timeline**: 6-8 weeks for full feature with all user stories

### Parallel Team Strategy (4 developers)

**Week 1-2: Foundation** (All developers collaborate)
- Team completes Setup + Foundational together (T001-T032)
- Pair programming on critical infrastructure (Prisma schema, middleware, event publisher)

**Week 3-4: MVP User Stories** (Parallel implementation)
- Developer A + B: User Story 1 (T033-T060) - Core issuance logic
- Developer C + D: User Story 3 (T070-T078) - Tenant isolation
- Daily sync on integration points

**Week 5: MVP Integration & Testing**
- All developers: Integration testing, bug fixes, documentation
- Deploy to staging

**Week 6-7: Remaining User Stories** (Parallel implementation)
- Developer A: User Story 2 (T061-T069) - Error handling
- Developer B: User Story 4 (T079-T089) - Audit trail
- Developer C: User Story 5 (T090-T097) - Concurrency
- Developer D: Polish tasks (T098-T120) - Documentation, monitoring

**Week 8: Final QA & Production Readiness**
- Full regression testing
- Performance testing (100+ concurrent requests)
- Security review
- Production deployment

---

## Task Counts by Phase

- **Phase 1 - Setup**: 8 tasks
- **Phase 2 - Foundational**: 24 tasks (CRITICAL BLOCKER)
- **Phase 3 - User Story 1 (P1 - MVP)**: 28 tasks
- **Phase 4 - User Story 2 (P2)**: 9 tasks
- **Phase 5 - User Story 3 (P1 - MVP)**: 9 tasks
- **Phase 6 - User Story 4 (P2)**: 11 tasks
- **Phase 7 - User Story 5 (P3)**: 8 tasks
- **Phase 8 - Polish**: 23 tasks

**Total**: 120 tasks

**MVP Scope** (US1 + US3): 32 + 24 + 8 = 64 tasks (~53% of total)

**Parallel Opportunities**: 47 tasks marked [P] across all phases (~39% can run in parallel with proper team coordination)

---

## Notes

- All tasks include exact file paths per plan.md project structure
- [P] tasks target different files and have no sequential dependencies
- [US1]-[US5] labels map tasks to specific user stories from spec.md
- Tests verify attribution correctness, tenant isolation, and spot exhaustion per spec requirements
- Constitution compliance verified in plan.md (all 7 principles satisfied)
- MVP (US1 + US3) delivers immediate value for drivers and supports multi-tenant SaaS
- Each user story independently completable and testable
- Stop at any checkpoint to validate story functionality before proceeding
