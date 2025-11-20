# Feature Specification: Émission de ticket à l'entrée

**Feature Branch**: `001-ticket-issuance`
**Created**: 2025-11-20
**Status**: Draft
**Input**: User description: "# Feature: Émission de ticket à l'entrée

## Objectif
Permettre à un client d'obtenir un ticket avec attribution de place lors de l'entrée dans un parking/garage.

## Contexte Métier
Première interaction client : borne d'entrée collecte infos véhicule, système attribue place selon type véhicule et disponibilité, ticket émis avec identifiant place sur bande magnétique.

## Principes Constitutionnels
- **Multi-Tenant Isolation** : chaque facility appartient à un tenant (provider/ville)
- **Real-Time State Management** : disponibilité places MAJ atomiquement
- **Audit & Compliance First** : événement émission ticket immutable, rétention 10 ans
- **Bounded Contexts** : Ticketing (émission) + Facility (disponibilité spots)
- **Event-Driven** : événement `TicketIssued` publié pour audit/analytics

## Scope
**In Scope**:
- Sélection type véhicule (moto, voiture, électrique, camion/bus, handicapé, familial)
- Attribution place disponible selon type et facility
- Génération ticket unique avec spot_id
- Écriture bande magnétique (abstraction hardware)
- Logging événement avec tenant_id

**Out of Scope**:
- Système de guidage (garages)
- Paiement
- Sortie
- Interface client finale (focus API/logique métier)

## Contraintes Techniques
- Lock pessimiste sur spot lors attribution
- Failure si aucune place disponible du type demandé
- Support multi-format ticket (magnetic stripe + future QR/NFC via adapter)

## Livrables Attendus
- API endpoint POST `/facilities/{facility_id}/tickets`
- Bounded context Ticketing avec aggregate Ticket
- Bounded context Facility avec query spots disponibles
- Event `TicketIssued` publié
- Tests : attribution correcte, isolation tenant, gestion épuisement places"

## User Scenarios & Testing

### User Story 1 - Entry with Available Parking Spot (Priority: P1)

A driver arrives at a parking facility entrance terminal and needs to obtain a ticket to enter. The driver selects their vehicle type, and the system assigns an available parking spot matching their vehicle requirements, then issues a ticket with the assigned spot information.

**Why this priority**: This is the core value proposition - without this, drivers cannot enter the facility. This represents the minimal viable feature that delivers immediate value.

**Independent Test**: Can be fully tested by simulating a vehicle arrival at a facility with available spots. Success means the driver receives a valid ticket with an assigned spot number.

**Acceptance Scenarios**:

1. **Given** a facility has available parking spots for standard cars, **When** a driver selects "voiture" (car) as their vehicle type, **Then** the system assigns an available car spot and issues a ticket with the spot identifier
2. **Given** a facility has available motorcycle spots, **When** a driver selects "moto" (motorcycle) as their vehicle type, **Then** the system assigns an available motorcycle spot and issues a ticket
3. **Given** a facility has available electric vehicle charging spots, **When** a driver selects "électrique" (electric) as their vehicle type, **Then** the system assigns an available electric charging spot and issues a ticket
4. **Given** a facility has available accessible spots, **When** a driver selects "handicapé" (accessible) as their vehicle type, **Then** the system assigns an available accessible spot and issues a ticket
5. **Given** a facility has available family spots, **When** a driver selects "familial" (family) as their vehicle type, **Then** the system assigns an available family spot and issues a ticket
6. **Given** a facility has available truck/bus spots, **When** a driver selects "camion/bus" as their vehicle type, **Then** the system assigns an available large vehicle spot and issues a ticket

---

### User Story 2 - Entry with No Available Spots (Priority: P2)

A driver arrives at a parking facility entrance terminal for which there are no available spots matching their vehicle type. The system must inform the driver that no spots are available without allowing entry.

**Why this priority**: Critical for facility capacity management and preventing overcrowding, but secondary to the happy path scenario. This protects facility operations and customer experience.

**Independent Test**: Can be fully tested by simulating a vehicle arrival at a facility with all spots occupied for that vehicle type. Success means the driver receives a clear rejection message without being issued a ticket.

**Acceptance Scenarios**:

1. **Given** a facility has no available car spots, **When** a driver selects "voiture" as their vehicle type, **Then** the system rejects the entry request with a message indicating no available spots for cars
2. **Given** a facility has no available motorcycle spots, **When** a driver selects "moto" as their vehicle type, **Then** the system rejects the entry request with a message indicating no available motorcycle spots
3. **Given** a facility has available car spots but no electric charging spots, **When** a driver selects "électrique" as their vehicle type, **Then** the system rejects the entry request with a message indicating no available electric spots

---

### User Story 3 - Multi-Tenant Isolation (Priority: P1)

A facility operator managing multiple parking facilities across different tenants (cities, private providers) needs to ensure that ticket issuance and spot allocation are isolated per facility and tenant. Each facility's spot availability must be managed independently without cross-tenant data leakage.

**Why this priority**: Essential for the system architecture and data security. Without this, the system cannot serve multiple tenants safely. This is foundational for a multi-tenant SaaS model.

**Independent Test**: Can be fully tested by creating facilities for different tenants and verifying that spot availability queries and ticket issuance operations never cross tenant boundaries.

**Acceptance Scenarios**:

1. **Given** Tenant A operates Facility 1 with 50 car spots and Tenant B operates Facility 2 with 30 car spots, **When** a driver requests entry to Facility 1, **Then** the system only considers spots from Facility 1 and Tenant A's context
2. **Given** multiple facilities across different tenants, **When** tickets are issued, **Then** each ticket includes the tenant identifier and can only access spots within that tenant's facilities
3. **Given** Facility 1 (Tenant A) is full and Facility 2 (Tenant B) has available spots, **When** a driver requests entry to Facility 1, **Then** the system rejects entry without considering spots from Facility 2

---

### User Story 4 - Ticket Uniqueness and Audit Trail (Priority: P2)

Facility operators and compliance officers need to ensure every issued ticket has a unique identifier and that all ticket issuance events are recorded immutably for audit, compliance, and analytics purposes with a 10-year retention period.

**Why this priority**: Critical for compliance, fraud prevention, and dispute resolution, but does not block basic entry functionality. This supports operational excellence and regulatory requirements.

**Independent Test**: Can be fully tested by issuing multiple tickets and verifying each has a unique identifier, all events are recorded, and the audit trail is queryable and immutable.

**Acceptance Scenarios**:

1. **Given** multiple drivers requesting tickets simultaneously, **When** tickets are issued, **Then** each ticket has a globally unique identifier with no collisions
2. **Given** a ticket is issued to a driver, **When** the issuance completes, **Then** a TicketIssued event is published containing ticket ID, facility ID, tenant ID, vehicle type, assigned spot ID, and timestamp
3. **Given** ticket issuance events are recorded, **When** querying the audit trail, **Then** all events are retrievable and cannot be modified or deleted
4. **Given** tickets issued over time, **When** compliance officers run audit reports, **Then** all ticket issuance events from the past 10 years are accessible

---

### User Story 5 - Concurrent Spot Assignment (Priority: P3)

Multiple drivers arrive at different entry terminals for the same facility simultaneously and request tickets for the same vehicle type. The system must ensure that spot assignment is atomic and that no two drivers are assigned the same spot.

**Why this priority**: Important for data consistency and customer satisfaction, but represents an edge case that can be handled after core functionality is working. Most facilities have staggered arrivals.

**Independent Test**: Can be fully tested by simulating concurrent ticket requests and verifying that spot assignments never overlap and availability is updated atomically.

**Acceptance Scenarios**:

1. **Given** a facility has only 1 available car spot, **When** two drivers request tickets for cars simultaneously, **Then** only one driver receives a ticket with that spot, and the other receives a rejection
2. **Given** multiple concurrent ticket requests for different vehicle types, **When** spots are assigned, **Then** spot availability is updated atomically without race conditions
3. **Given** a spot is being assigned to a driver, **When** another request attempts to claim the same spot, **Then** the system prevents double-booking using pessimistic locking

---

### Edge Cases

- What happens when a facility's entry terminal loses connectivity during ticket issuance?
- How does the system handle vehicle type selection errors (e.g., driver selects wrong type)?
- What happens if the ticket writing mechanism fails after spot assignment?
- How does the system handle facilities with zero configured spots for a particular vehicle type?
- What happens when a ticket is issued but the driver does not enter (e.g., changes their mind)?
- How does the system handle clock skew across distributed entry terminals?
- What happens when spot availability is updated while a ticket issuance is in progress?

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow drivers to select from six vehicle types: moto (motorcycle), voiture (car), électrique (electric vehicle), camion/bus (truck/bus), handicapé (accessible), familial (family)
- **FR-002**: System MUST query available parking spots filtered by facility identifier and vehicle type
- **FR-003**: System MUST assign exactly one available spot matching the requested vehicle type from the requested facility
- **FR-004**: System MUST use pessimistic locking when assigning a spot to prevent concurrent assignment of the same spot
- **FR-005**: System MUST generate a globally unique ticket identifier for each issued ticket
- **FR-006**: System MUST include the assigned spot identifier on the issued ticket
- **FR-007**: System MUST write ticket data to a magnetic stripe format
- **FR-008**: System MUST support future ticket formats (QR code, NFC) through an adapter pattern abstraction
- **FR-009**: System MUST reject ticket requests when no spots are available for the requested vehicle type
- **FR-010**: System MUST publish a TicketIssued event containing ticket ID, facility ID, tenant ID, vehicle type, assigned spot ID, and issuance timestamp
- **FR-011**: System MUST store all TicketIssued events immutably for audit and compliance purposes
- **FR-012**: System MUST retain all ticket issuance events for a minimum of 10 years
- **FR-013**: System MUST isolate all ticket issuance operations by tenant identifier to prevent cross-tenant data access
- **FR-014**: System MUST ensure that spot availability queries are scoped to the requested facility and its owning tenant
- **FR-015**: System MUST update spot availability status atomically when a spot is assigned to a ticket
- **FR-016**: System MUST expose a ticket issuance endpoint accepting facility identifier and vehicle type as inputs
- **FR-017**: System MUST return ticket details including ticket identifier and assigned spot identifier upon successful issuance
- **FR-018**: System MUST return a clear error message when ticket issuance fails due to no available spots

### Key Entities

- **Ticket**: Represents an issued parking ticket with a unique identifier, assigned spot reference, vehicle type, issuance timestamp, facility reference, and tenant reference
- **Facility**: Represents a parking facility belonging to a specific tenant, containing a collection of parking spots with different types
- **Spot**: Represents a single parking space with attributes including spot identifier, vehicle type compatibility, availability status, and facility reference
- **TicketIssued Event**: Immutable audit event capturing ticket issuance with ticket ID, facility ID, tenant ID, vehicle type, assigned spot ID, and timestamp
- **Tenant**: Represents a facility operator (city, private provider) owning one or more facilities with complete data isolation

## Success Criteria

### Measurable Outcomes

- **SC-001**: Drivers receive a valid ticket with assigned spot information within 3 seconds of selecting their vehicle type
- **SC-002**: System handles at least 100 concurrent ticket requests per facility without errors or duplicate spot assignments
- **SC-003**: 100% of ticket issuance events are published and stored immutably in the audit trail
- **SC-004**: Zero instances of two drivers being assigned the same parking spot
- **SC-005**: 100% of ticket requests for facilities with no available spots receive immediate rejection with clear messaging
- **SC-006**: All tenant data remains isolated with zero cross-tenant data access incidents
- **SC-007**: All ticket issuance audit events remain accessible for the full 10-year retention period
- **SC-008**: System achieves 99.9% uptime for ticket issuance operations during facility operating hours

## Assumptions

- Each facility has pre-configured parking spots with designated vehicle type compatibility
- Vehicle type selection is performed by the driver via a user interface (terminal, kiosk, or mobile app) not specified in this feature
- Magnetic stripe writing hardware is already integrated and accessible via a hardware abstraction layer
- Network connectivity between entry terminals and the backend system is generally reliable
- Tenant and facility identifiers are established during facility onboarding and are available at ticket issuance time
- Spot availability is managed in near real-time with acceptable latency for atomic updates
- The TicketIssued event publishing mechanism (message queue, event bus) is already established in the system architecture
