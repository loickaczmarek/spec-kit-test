import {
  PrismaClient,
  TenantStatus,
  FacilityStatus,
  VehicleType,
  SpotStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create test tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'test-city' },
    update: {},
    create: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test City',
      slug: 'test-city',
      status: TenantStatus.ACTIVE,
    },
  });
  console.log(`Created tenant: ${tenant.name} (${tenant.id})`);

  // Create Main Garage facility
  const mainGarage = await prisma.facility.upsert({
    where: { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7' },
    update: {},
    create: {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      tenant_id: tenant.id,
      name: 'Main Garage',
      address: '123 Main Street, Test City',
      timezone: 'Europe/Paris',
      total_spots: 85,
      status: FacilityStatus.ACTIVE,
    },
  });
  console.log(`Created facility: ${mainGarage.name}`);

  // Create spots for Main Garage
  const spotTypes = [
    { type: VehicleType.CAR, count: 50, prefix: 'A' },
    { type: VehicleType.MOTORCYCLE, count: 10, prefix: 'M' },
    { type: VehicleType.ELECTRIC, count: 10, prefix: 'E' },
    { type: VehicleType.TRUCK_BUS, count: 5, prefix: 'T' },
    { type: VehicleType.ACCESSIBLE, count: 5, prefix: 'H' },
    { type: VehicleType.FAMILY, count: 5, prefix: 'F' },
  ];

  for (const spotType of spotTypes) {
    for (let i = 1; i <= spotType.count; i++) {
      const spotNumber = `${spotType.prefix}-${i.toString().padStart(3, '0')}`;

      await prisma.spot.upsert({
        where: {
          facility_id_spot_number: {
            facility_id: mainGarage.id,
            spot_number: spotNumber,
          },
        },
        update: {},
        create: {
          facility_id: mainGarage.id,
          spot_number: spotNumber,
          vehicle_type: spotType.type,
          status: SpotStatus.AVAILABLE,
          version: 1,
        },
      });
    }
    console.log(`Created ${spotType.count} ${spotType.type} spots`);
  }

  // Create Airport Lot facility
  const airportLot = await prisma.facility.upsert({
    where: { id: '8d0f7780-8536-51ef-a5d8-f18fc2g01bf8' },
    update: {},
    create: {
      id: '8d0f7780-8536-51ef-a5d8-f18fc2g01bf8',
      tenant_id: tenant.id,
      name: 'Airport Lot',
      address: '456 Airport Road, Test City',
      timezone: 'Europe/Paris',
      total_spots: 85,
      status: FacilityStatus.ACTIVE,
    },
  });
  console.log(`Created facility: ${airportLot.name}`);

  // Create spots for Airport Lot
  for (const spotType of spotTypes) {
    for (let i = 1; i <= spotType.count; i++) {
      const spotNumber = `${spotType.prefix}-${i.toString().padStart(3, '0')}`;

      await prisma.spot.upsert({
        where: {
          facility_id_spot_number: {
            facility_id: airportLot.id,
            spot_number: spotNumber,
          },
        },
        update: {},
        create: {
          facility_id: airportLot.id,
          spot_number: spotNumber,
          vehicle_type: spotType.type,
          status: SpotStatus.AVAILABLE,
          version: 1,
        },
      });
    }
  }
  console.log(`Created ${85} spots for Airport Lot`);

  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
