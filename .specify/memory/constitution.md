<!--
SYNC IMPACT REPORT - Constitution Update
================================================================================
Version Change: Template → 1.0.0
Change Type: Initial ratification (MAJOR - new constitution from template)

Modified Principles:
- NEW: I. Multi-Tenant Isolation
- NEW: II. Real-Time State Management
- NEW: III. Audit & Compliance First
- NEW: IV. Domain-Driven Design
- NEW: V. Event-Driven Architecture
- NEW: VI. Platform Interoperability
- NEW: VII. Bounded Contexts

Added Sections:
- Core Principles (7 principles defined)
- Data Retention & Compliance
- Development Standards
- Governance

Removed Sections:
- None (initial constitution)

Templates Requiring Updates:
✅ plan-template.md - Generic constitution check already in place (line 30-34)
✅ spec-template.md - No constitution-specific references found
✅ tasks-template.md - No constitution-specific references found

Follow-up TODOs:
- None - all placeholders filled

Date: 2025-11-20
================================================================================
-->

# Parking Management Platform Constitution

## Core Principles

### I. Multi-Tenant Isolation

Every feature MUST support multi-tenancy from day one. Each parking provider, city, and
facility operates as an independent tenant with strict data isolation. Shared infrastructure
MUST NOT leak data across tenant boundaries. All database queries, API endpoints, and
background jobs MUST include tenant context filtering.

**Rationale**: The platform serves multiple European cities and parking providers
simultaneously. A data breach or cross-tenant data exposure would be catastrophic for
business trust and GDPR compliance.

**Non-Negotiable Rules**:
- All database tables include `tenant_id` or equivalent scoping
- All API requests validate tenant authorization before data access
- Background jobs process tenant data independently
- No global admin features that bypass tenant isolation

### II. Real-Time State Management

Vehicle location, parking spot availability, and guidance system state MUST be managed
in real-time with eventual consistency acceptable only for non-critical aggregations.
Critical state transitions (entry, payment, exit) MUST use pessimistic locking or
distributed consensus to prevent race conditions.

**Rationale**: Guidance systems direct vehicles to available spots. Showing a spot as
available when occupied creates poor user experience and operational chaos. Payment
validation at exit gates cannot tolerate stale data.

**Non-Negotiable Rules**:
- Spot availability updates use atomic operations
- Entry/exit gate operations lock ticket state during transitions
- Guidance systems poll or subscribe to real-time availability feeds
- Payment terminals verify ticket state before accepting payment

### III. Audit & Compliance First

All ticket transactions, payment events, vehicle entries/exits, and system state changes
MUST be immutably logged with complete audit trails. Ticket data MUST be retained for
10 years to satisfy European fiscal compliance requirements. Personal data retention
follows GDPR minimum necessary principle with automated purging after legal retention
periods expire.

**Rationale**: Tax authorities require complete transaction history. Disputes over
parking fees or damage claims require forensic reconstruction of vehicle journeys.
GDPR mandates data minimization and right to erasure.

**Non-Negotiable Rules**:
- Event sourcing for all ticket lifecycle events (issued, paid, validated, expired)
- Append-only audit logs for payment transactions
- Automated compliance reports for tax authorities
- Separate retention policies: 10 years for financial data, minimal for PII
- Anonymization pipelines for analytics after PII retention expires

### IV. Domain-Driven Design

The platform MUST organize around bounded contexts reflecting the parking domain:
Facility Management (garages/lots, spots, zones), Ticketing (issuance, validation),
Payment Processing, Vehicle Guidance, and Tenant Management. Each bounded context
owns its data models and exposes well-defined contracts. Cross-context dependencies
use integration events, not direct database access.

**Rationale**: The parking domain is complex with distinct subdomains having different
consistency and performance requirements. Clear boundaries prevent the "big ball of mud"
and enable independent scaling and team ownership.

**Non-Negotiable Rules**:
- Each bounded context has dedicated persistence (schema or database)
- Inter-context communication via events or API contracts
- No foreign keys across bounded contexts
- Shared kernel concepts (e.g., TenantId, TicketId) defined once, referenced everywhere

### V. Event-Driven Architecture

State changes that affect multiple systems (vehicle entry triggers spot allocation,
guidance updates, and audit logging) MUST use asynchronous events. Synchronous request/
response appropriate only for user-facing operations requiring immediate feedback
(payment confirmation, exit gate validation).

**Rationale**: A vehicle entering triggers multiple downstream actions: decrement
available spots, update guidance displays, log entry event, potentially notify mobile
apps. Coupling these synchronously creates brittle chains of failure.

**Non-Negotiable Rules**:
- Entry/exit events published to event bus (Kafka, RabbitMQ, or equivalent)
- Subscribers handle events idempotently (duplicate events possible)
- Critical path operations (exit gate opening) must not block on non-critical subscribers
- Event schemas versioned and backward-compatible

### VI. Platform Interoperability

The system MUST integrate with legacy magnetic stripe ticket systems and modern QR/NFC
alternatives. Terminal hardware (entry gates, payment kiosks, exit barriers) from
different vendors MUST be supported via adapter patterns. APIs MUST provide both
human-readable (JSON, text) and machine-readable formats.

**Rationale**: Existing parking facilities have deployed hardware that cannot be
immediately replaced. The platform must work with what's there while enabling
migration to modern alternatives.

**Non-Negotiable Rules**:
- Hardware abstraction layer for ticket readers/writers
- Support for magnetic stripe, QR code, NFC, and license plate recognition
- REST APIs return JSON by default with content negotiation for other formats
- Webhook support for real-time integrations with third-party systems

### VII. Bounded Contexts

Identify and enforce boundaries between Facility Operations (spot management, garage
topology), Ticketing (ticket lifecycle, validation rules), Payment (pricing, transaction
processing), Guidance (real-time routing, display updates), and Analytics (reporting,
occupancy forecasting). Each context may evolve independently as long as public
contracts remain stable.

**Rationale**: Different parking operators have unique pricing models, guidance
algorithms, and reporting needs. Rigid coupling prevents customization per tenant.

**Non-Negotiable Rules**:
- Facility context owns spot topology, entry/exit gate configuration
- Ticketing context owns ticket issuance, expiration policies, validation logic
- Payment context owns pricing rules, transaction processing, refunds
- Guidance context owns routing algorithms, display content
- Analytics context consumes events from all contexts but does not dictate source schemas

## Data Retention & Compliance

### Fiscal Compliance
- Ticket transactions retained 10 years (European tax law requirement)
- Payment records retained 10 years with immutable audit trail
- Automated monthly compliance reports for each tenant jurisdiction

### GDPR & Privacy
- Vehicle license plates hashed after exit (retain hash for dispute resolution)
- Video footage (if any) retained 30 days maximum unless linked to incident
- User PII (for registered accounts) deleted upon account closure request
- Anonymized aggregates for analytics (no linkage to individuals)

### Audit Logging
- All API calls to critical endpoints logged (entry, payment, exit)
- Admin actions logged with user identity and timestamp
- Logs retained 1 year for operational forensics, 10 years for financial audits

## Development Standards

### Testing Requirements
- Unit tests for business logic (pricing calculations, validation rules)
- Integration tests for bounded context contracts
- Contract tests for APIs consumed by external terminals
- Load tests for entry/exit peak hours (simulate 1000+ vehicles/hour per facility)

### Code Organization
- Single repository with bounded context modules: `src/facility/`, `src/ticketing/`,
  `src/payment/`, `src/guidance/`, `src/analytics/`
- Shared kernel in `src/shared/` (TenantId, common value objects, event base classes)
- Infrastructure adapters in `src/adapters/` (magnetic stripe, database, message bus)

### Deployment & Operations
- Each bounded context deployable independently (microservices or modular monolith)
- Blue-green deployments for zero-downtime updates
- Feature flags for tenant-specific customizations
- Observability: structured logs, distributed tracing, metrics per tenant and facility

## Governance

### Amendment Process
1. Proposed changes documented with rationale and impact analysis
2. Review by technical leads from each affected bounded context
3. Approval requires consensus (blocking concerns must be resolved)
4. Migration plan required for breaking changes
5. Version bump: MAJOR (breaking), MINOR (new principle/section), PATCH (clarification)

### Compliance Review
- All feature specs MUST reference relevant constitutional principles
- Implementation plans MUST justify any complexity against constitutional constraints
- Code reviews MUST verify tenant isolation, audit logging, and bounded context boundaries
- Quarterly architecture review to identify constitutional drift

### Exceptions
Exceptions to constitutional principles require:
- Written justification with specific business need
- Technical alternatives considered and rejected
- Time-boxed expiration (temporary exception) or amendment proposal (permanent change)
- Approval from product owner and technical architect

**Version**: 1.0.0 | **Ratified**: 2025-11-20 | **Last Amended**: 2025-11-20
