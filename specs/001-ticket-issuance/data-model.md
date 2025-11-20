# Data Model: Ticket Issuance

**Feature**: 001-ticket-issuance
**Date**: 2025-11-20
**Database**: PostgreSQL 16 with Prisma ORM

## Overview

This data model supports the ticket issuance feature with multi-tenant isolation, real-time spot availability, and 10-year audit retention. The model is organized by bounded contexts (Facility and Ticketing) with a shared kernel for common value objects.

---

## Bounded Context: Shared Kernel

### Tenant

Represents a parking facility operator (city, private provider) with complete data isolation.

**Fields**:
- `id` (UUID, PK): Unique tenant identifier
- `name` (String, NOT NULL): Tenant display name (e.g., "Ville de Paris", "ParkCo Europe")
- `slug` (String, UNIQUE, NOT NULL): URL-safe identifier (e.g., "paris", "parkco-europe")
- `created_at` (Timestamp, NOT NULL): Account creation timestamp
- `status` (Enum: ACTIVE, SUSPENDED, DELETED): Tenant account status

**Indexes**:
- Primary Key: `id`
- Unique: `slug`

**Relationships**:
- One Tenant has many Facilities

**Validation Rules**:
- `name`: 3-100 characters
- `slug`: Lowercase alphanumeric + hyphens only, 3-50 characters
- `status`: Defaults to ACTIVE on creation

---

## Bounded Context: Facility

### Facility

Represents a parking facility (garage, lot) belonging to a specific tenant with collection of parking spots.

**Fields**:
- `id` (UUID, PK): Unique facility identifier
- `tenant_id` (UUID, FK → Tenant.id, NOT NULL): Owning tenant
- `name` (String, NOT NULL): Facility name (e.g., "Gare du Nord Parking", "Airport Lot B")
- `address` (String, NOT NULL): Physical address
- `timezone` (String, NOT NULL): IANA timezone (e.g., "Europe/Paris")
- `total_spots` (Integer, NOT NULL): Total parking capacity
- `created_at` (Timestamp, NOT NULL): Facility registration timestamp
- `status` (Enum: ACTIVE, MAINTENANCE, CLOSED): Operational status

**Indexes**:
- Primary Key: `id`
- Index: `tenant_id` (for tenant-scoped queries)
- Index: `status` (for active facility filtering)

**Relationships**:
- Many Facilities belong to one Tenant
- One Facility has many Spots

**Validation Rules**:
- `name`: 3-200 characters
- `total_spots`: Positive integer > 0
- `timezone`: Valid IANA timezone identifier
- `status`: Defaults to ACTIVE on creation

---

### Spot

Represents a single parking space with vehicle type compatibility and availability status.

**Fields**:
- `id` (UUID, PK): Unique spot identifier
- `facility_id` (UUID, FK → Facility.id, NOT NULL): Parent facility
- `spot_number` (String, NOT NULL): Human-readable spot identifier (e.g., "A-101", "Level 2 - 42")
- `vehicle_type` (Enum, NOT NULL): Compatible vehicle type (MOTORCYCLE, CAR, ELECTRIC, TRUCK_BUS, ACCESSIBLE, FAMILY)
- `status` (Enum, NOT NULL): Availability status (AVAILABLE, OCCUPIED, RESERVED, MAINTENANCE, OUT_OF_SERVICE)
- `created_at` (Timestamp, NOT NULL): Spot creation timestamp
- `updated_at` (Timestamp, NOT NULL): Last status change timestamp
- `version` (Integer, NOT NULL): Optimistic locking version (for future use)

**Indexes**:
- Primary Key: `id`
- Composite Index: `(facility_id, vehicle_type, status)` (for availability queries)
- Unique: `(facility_id, spot_number)` (prevent duplicate spot numbers within facility)

**Relationships**:
- Many Spots belong to one Facility

**Validation Rules**:
- `spot_number`: 1-50 characters, alphanumeric + hyphens/spaces
- `vehicle_type`: Must be one of 6 supported types (FR-001)
- `status`: Defaults to AVAILABLE on creation
- `version`: Defaults to 1, incremented on each update

**State Transitions**:
- `AVAILABLE` → `OCCUPIED`: When ticket issued
- `OCCUPIED` → `AVAILABLE`: When vehicle exits (future feature)
- `AVAILABLE` → `MAINTENANCE`: Admin sets spot offline
- `MAINTENANCE` → `AVAILABLE`: Admin restores spot
- `AVAILABLE` → `OUT_OF_SERVICE`: Permanent removal (e.g., construction)

---

### VehicleType (Enum)

Supported vehicle types for spot compatibility.

**Values**:
- `MOTORCYCLE`: Two-wheeled vehicles, scooters
- `CAR`: Standard passenger vehicles
- `ELECTRIC`: Electric vehicles requiring charging stations
- `TRUCK_BUS`: Large vehicles (trucks, buses, RVs)
- `ACCESSIBLE`: Accessible parking spots (wider spaces, ramps)
- `FAMILY`: Family-friendly spots (near elevators, wider for strollers)

**Mapping to User Input** (FR-001):
- "moto" → MOTORCYCLE
- "voiture" → CAR
- "électrique" → ELECTRIC
- "camion/bus" → TRUCK_BUS
- "handicapé" → ACCESSIBLE
- "familial" → FAMILY

---

## Bounded Context: Ticketing

### Ticket

Represents an issued parking ticket with assigned spot and audit metadata.

**Fields**:
- `id` (UUID, PK): Unique ticket identifier (globally unique across all tenants)
- `tenant_id` (UUID, FK → Tenant.id, NOT NULL): Issuing tenant (for multi-tenant isolation)
- `facility_id` (UUID, FK → Facility.id, NOT NULL): Facility where ticket issued
- `spot_id` (UUID, FK → Spot.id, NOT NULL): Assigned parking spot
- `vehicle_type` (Enum, NOT NULL): Vehicle type selected by driver
- `issued_at` (Timestamp, NOT NULL): Ticket issuance timestamp (UTC)
- `expires_at` (Timestamp, NULLABLE): Ticket expiration (future feature, NULL for now)
- `status` (Enum, NOT NULL): Ticket lifecycle status (ISSUED, PAID, VALIDATED, EXPIRED, CANCELLED)
- `barcode` (String, NULLABLE): Physical ticket encoding (magnetic stripe data, QR code, NFC payload)
- `created_at` (Timestamp, NOT NULL): Database record creation timestamp
- `updated_at` (Timestamp, NOT NULL): Last update timestamp

**Indexes**:
- Primary Key: `id`
- Index: `tenant_id` (for tenant-scoped queries)
- Index: `facility_id` (for facility-scoped reports)
- Index: `spot_id` (for spot occupancy tracking)
- Index: `issued_at` (for time-series queries and retention policies)
- Index: `status` (for active ticket filtering)

**Relationships**:
- Many Tickets belong to one Tenant
- Many Tickets belong to one Facility
- Many Tickets reference one Spot (at time of issuance)

**Validation Rules**:
- `id`: UUIDv7 (time-sortable for audit queries)
- `vehicle_type`: Must match `spot_id.vehicle_type` at issuance time
- `issued_at`: Cannot be in the future
- `status`: Defaults to ISSUED on creation
- `barcode`: Max 500 characters (accommodate magnetic stripe + future QR/NFC)

**Retention Policy**:
- Hard retention: 10 years from `issued_at` (FR-012, SC-007)
- Partition by year for efficient archival queries
- Soft deletion: `status = CANCELLED` instead of DELETE for audit trail

---

### TicketAuditLog

Immutable append-only log of ticket lifecycle events for compliance and forensics.

**Fields**:
- `id` (UUID, PK): Unique audit log entry identifier
- `ticket_id` (UUID, FK → Ticket.id, NOT NULL): Associated ticket
- `tenant_id` (UUID, NOT NULL): Tenant context (denormalized for fast filtering)
- `event_type` (Enum, NOT NULL): Lifecycle event (ISSUED, PAID, VALIDATED, EXPIRED, CANCELLED)
- `timestamp` (Timestamp, NOT NULL): Event occurrence timestamp (UTC)
- `actor` (String, NULLABLE): Who triggered event (e.g., "system", "admin:user_id", "terminal:terminal_id")
- `metadata` (JSONB, NULLABLE): Event-specific data (e.g., payment amount, cancellation reason)
- `created_at` (Timestamp, NOT NULL): Log entry creation timestamp

**Indexes**:
- Primary Key: `id`
- Index: `ticket_id` (for ticket history queries)
- Index: `tenant_id` (for tenant audit reports)
- Index: `timestamp` (for time-series compliance queries)
- GIN Index: `metadata` (for JSONB field searches)

**Validation Rules**:
- `event_type`: Must correspond to ticket status transition
- `timestamp`: Immutable after creation
- `metadata`: Max 10KB JSONB (prevent abuse)

**Retention Policy**:
- Hard retention: 10 years from `timestamp` (FR-012)
- Partition by year for archival
- **NO UPDATES OR DELETES** - Append-only integrity (FR-011)

---

## Event Schema (Kafka Topics)

### TicketIssued (v1)

Published to Kafka topic `tickets.issued.v1` after successful ticket creation.

**Schema**:
```json
{
  "schema_version": "v1.TicketIssued",
  "event_id": "01J9...",           // UUIDv7 (time-sortable)
  "timestamp": "2025-11-20T14:30:00Z",
  "tenant_id": "550e8400-...",
  "facility_id": "7c9e6679-...",
  "ticket_id": "3f333df6-...",
  "spot_id": "9b1deb4d-...",
  "spot_number": "A-101",
  "vehicle_type": "CAR",
  "issued_at": "2025-11-20T14:30:00Z"
}
```

**Consumer Behavior**:
- Analytics context: Aggregate spot occupancy statistics
- Guidance context (future): Update real-time availability displays
- Audit context: Archive to long-term cold storage (S3, Glacier)

**Idempotency**: Consumers use `event_id` as deduplication key

---

## Value Objects (TypeScript Domain Layer)

### TenantId

```typescript
class TenantId {
  constructor(private readonly value: string) {
    if (!isUUID(value)) throw new Error("Invalid tenant ID");
  }
  toString(): string { return this.value; }
  equals(other: TenantId): boolean { return this.value === other.value; }
}
```

### FacilityId, TicketId, SpotId

Similar structure to `TenantId` with UUID validation.

---

## Database Indexes Summary

| Table | Index Type | Columns | Purpose |
|-------|-----------|---------|---------|
| Tenant | Unique | `slug` | Lookup by URL-safe identifier |
| Facility | Index | `tenant_id` | Tenant-scoped facility queries |
| Facility | Index | `status` | Filter active facilities |
| Spot | Composite | `(facility_id, vehicle_type, status)` | Fast availability queries (FR-002) |
| Spot | Unique | `(facility_id, spot_number)` | Prevent duplicate spot numbers |
| Ticket | Index | `tenant_id` | Tenant-scoped ticket queries |
| Ticket | Index | `facility_id` | Facility-scoped reports |
| Ticket | Index | `spot_id` | Spot occupancy tracking |
| Ticket | Index | `issued_at` | Time-series queries, retention |
| Ticket | Index | `status` | Active ticket filtering |
| TicketAuditLog | Index | `ticket_id` | Ticket history queries |
| TicketAuditLog | Index | `tenant_id` | Tenant audit reports |
| TicketAuditLog | Index | `timestamp` | Compliance time-series queries |
| TicketAuditLog | GIN | `metadata` | JSONB field searches |

---

## Prisma Schema Excerpt

```prisma
// Shared Kernel
model Tenant {
  id         String     @id @default(uuid())
  name       String
  slug       String     @unique
  status     TenantStatus @default(ACTIVE)
  created_at DateTime   @default(now())

  facilities Facility[]
  tickets    Ticket[]
}

// Facility Context
model Facility {
  id           String          @id @default(uuid())
  tenant_id    String
  name         String
  address      String
  timezone     String
  total_spots  Int
  status       FacilityStatus  @default(ACTIVE)
  created_at   DateTime        @default(now())

  tenant       Tenant          @relation(fields: [tenant_id], references: [id])
  spots        Spot[]
  tickets      Ticket[]

  @@index([tenant_id])
  @@index([status])
}

model Spot {
  id           String       @id @default(uuid())
  facility_id  String
  spot_number  String
  vehicle_type VehicleType
  status       SpotStatus   @default(AVAILABLE)
  version      Int          @default(1)
  created_at   DateTime     @default(now())
  updated_at   DateTime     @updatedAt

  facility     Facility     @relation(fields: [facility_id], references: [id])
  tickets      Ticket[]

  @@unique([facility_id, spot_number])
  @@index([facility_id, vehicle_type, status])
}

// Ticketing Context
model Ticket {
  id           String       @id @default(uuid())
  tenant_id    String
  facility_id  String
  spot_id      String
  vehicle_type VehicleType
  issued_at    DateTime     @default(now())
  expires_at   DateTime?
  status       TicketStatus @default(ISSUED)
  barcode      String?
  created_at   DateTime     @default(now())
  updated_at   DateTime     @updatedAt

  tenant       Tenant       @relation(fields: [tenant_id], references: [id])
  facility     Facility     @relation(fields: [facility_id], references: [id])
  spot         Spot         @relation(fields: [spot_id], references: [id])
  audit_logs   TicketAuditLog[]

  @@index([tenant_id])
  @@index([facility_id])
  @@index([spot_id])
  @@index([issued_at])
  @@index([status])
}

model TicketAuditLog {
  id         String    @id @default(uuid())
  ticket_id  String
  tenant_id  String
  event_type AuditEventType
  timestamp  DateTime  @default(now())
  actor      String?
  metadata   Json?
  created_at DateTime  @default(now())

  ticket     Ticket    @relation(fields: [ticket_id], references: [id])

  @@index([ticket_id])
  @@index([tenant_id])
  @@index([timestamp])
}

// Enums
enum TenantStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum FacilityStatus {
  ACTIVE
  MAINTENANCE
  CLOSED
}

enum VehicleType {
  MOTORCYCLE
  CAR
  ELECTRIC
  TRUCK_BUS
  ACCESSIBLE
  FAMILY
}

enum SpotStatus {
  AVAILABLE
  OCCUPIED
  RESERVED
  MAINTENANCE
  OUT_OF_SERVICE
}

enum TicketStatus {
  ISSUED
  PAID
  VALIDATED
  EXPIRED
  CANCELLED
}

enum AuditEventType {
  ISSUED
  PAID
  VALIDATED
  EXPIRED
  CANCELLED
}
```

---

## Multi-Tenant Isolation Strategy

### Application Layer
- Express middleware extracts `tenant_id` from JWT/API key
- All repository methods auto-filter by `tenant_id`
- Prisma middleware injects `WHERE tenant_id = ?` on all queries

### Database Layer (Row-Level Security)
```sql
-- Enable RLS on tenant-scoped tables
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only access their tenant's data
CREATE POLICY tenant_isolation_tickets ON tickets
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation_facilities ON facilities
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Set tenant context before each transaction
SET app.tenant_id = '550e8400-e29b-41d4-a716-446655440000';
```

---

## Pessimistic Locking Query

```typescript
// TicketIssuanceService.ts
async assignSpot(facilityId: FacilityId, vehicleType: VehicleType): Promise<Spot> {
  return await prisma.$transaction(async (tx) => {
    // Pessimistic lock: SELECT FOR UPDATE
    const availableSpot = await tx.$queryRaw<Spot>`
      SELECT * FROM spots
      WHERE facility_id = ${facilityId.toString()}
        AND vehicle_type = ${vehicleType}
        AND status = 'AVAILABLE'
      ORDER BY spot_number ASC
      LIMIT 1
      FOR UPDATE NOWAIT  -- Fail immediately if spot locked by another transaction
    `;

    if (!availableSpot) {
      throw new NoSpotsAvailableError(facilityId, vehicleType);
    }

    // Update spot status while lock held
    await tx.spot.update({
      where: { id: availableSpot.id },
      data: { status: 'OCCUPIED', updated_at: new Date() }
    });

    return availableSpot;
    // Lock released on transaction commit
  });
}
```

---

## Retention & Archival Strategy

### 10-Year Retention (FR-012, SC-007)

**Hot Storage** (0-2 years):
- Full PostgreSQL tables for fast queries
- All indexes active

**Warm Storage** (2-7 years):
- Partitioned tables by year
- Reduced indexes (primary key + tenant_id only)
- Compressed tablespaces

**Cold Storage** (7-10 years):
- Export to S3/Glacier as Parquet files
- Queryable via AWS Athena / Azure Synapse
- Delete from PostgreSQL after export

**Automated Archival Job**:
```typescript
// cron: 0 2 * * * (daily at 2 AM)
async archiveOldTickets() {
  const cutoffDate = subYears(new Date(), 2);

  // Export to S3
  const tickets = await prisma.ticket.findMany({
    where: { issued_at: { lt: cutoffDate } }
  });
  await s3.upload(`tickets-archive-${cutoffDate.getFullYear()}.parquet`, tickets);

  // Move to warm partition
  await prisma.$executeRaw`
    ALTER TABLE tickets DETACH PARTITION tickets_${cutoffDate.getFullYear()}
  `;
}
```

---

## Validation Rules Summary

| Entity | Field | Validation |
|--------|-------|-----------|
| Tenant | name | 3-100 chars |
| Tenant | slug | Lowercase alphanumeric + hyphens, 3-50 chars, unique |
| Facility | name | 3-200 chars |
| Facility | total_spots | Positive integer > 0 |
| Facility | timezone | Valid IANA timezone |
| Spot | spot_number | 1-50 chars, alphanumeric + hyphens/spaces, unique per facility |
| Spot | vehicle_type | One of 6 supported types |
| Ticket | vehicle_type | Must match assigned spot's vehicle_type |
| Ticket | issued_at | Cannot be in future |
| Ticket | barcode | Max 500 chars |
| TicketAuditLog | metadata | Max 10KB JSONB |

---

## Next Steps

Data model complete. Proceed to:
1. Generate OpenAPI contracts in `/contracts/`
2. Create `quickstart.md` for database setup
3. Update agent context with data model details
