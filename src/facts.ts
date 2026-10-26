import neo4j from "neo4j-driver";

export type HotelSummary = {
  name: string;
  address: string | null;
};

export type RoomFact = {
  type: string | null;
  bed_configuration: string | null;
  max_occupancy: number | null;
  min_rate: number | null;
  max_rate: number | null;
};

export type PolicyFact = {
  name: string | null;
  description: string | null;
};

export type ServiceFact = {
  name: string | null;
  description: string | null;
  cost: string | null;
  hours: string | null;
  is_available: boolean | null;
  is_complimentary: boolean | null;
};

export type FactSheet = {
  name: string;
  address: string | null;
  guest_rating: number | null;
  total_rooms: number | null;
  email: string | null;
  phone: string | null;
  rooms: RoomFact[];
  amenities: string[];
  policies: PolicyFact[];
  services: ServiceFact[];
};

export const RECORD_NOTE =
  "The amenity names and the service records are the complete lists stored for this hotel. A facility or service that does not appear is not offered in this record. Each room's max_occupancy is the guest limit for that room. This record does not include live room availability.";

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (neo4j.isInt(value)) {
    const number = value.toNumber();
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

export function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function byName(
  left: { name: string | null },
  right: { name: string | null },
): number {
  return (left.name ?? "").localeCompare(right.name ?? "", undefined, {
    sensitivity: "base",
  });
}

export function normalizeFactSheet(raw: unknown): FactSheet | null {
  const hotel = asRecord(raw);
  const name = asString(hotel?.name);
  if (!hotel || !name) return null;

  const rooms = asList(hotel.rooms)
    .map((room) => {
      const record = asRecord(room);
      if (!record) return null;
      return {
        type: asString(record.type),
        bed_configuration: asString(record.bed_configuration),
        max_occupancy: asNumber(record.max_occupancy),
        min_rate: asNumber(record.min_rate),
        max_rate: asNumber(record.max_rate),
      };
    })
    .filter((room): room is RoomFact => room !== null)
    .sort((left, right) =>
      (left.type ?? "").localeCompare(right.type ?? "", undefined, {
        sensitivity: "base",
      }),
    );

  const amenities = asList(hotel.amenities)
    .map((amenity) => asString(amenity))
    .filter((amenity): amenity is string => amenity !== null)
    .sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    );

  const policies = asList(hotel.policies)
    .map((policy) => {
      const record = asRecord(policy);
      if (!record) return null;
      return {
        name: asString(record.name),
        description: asString(record.description),
      };
    })
    .filter((policy): policy is PolicyFact => policy !== null)
    .sort(byName);

  const services = asList(hotel.services)
    .map((service) => {
      const record = asRecord(service);
      if (!record) return null;
      return {
        name: asString(record.name),
        description: asString(record.description),
        cost: asString(record.cost),
        hours: asString(record.hours),
        is_available: asBoolean(record.is_available),
        is_complimentary: asBoolean(record.is_complimentary),
      };
    })
    .filter((service): service is ServiceFact => service !== null)
    .sort(byName);

  return {
    name,
    address: asString(hotel.address),
    guest_rating: asNumber(hotel.guest_rating),
    total_rooms: asNumber(hotel.total_rooms),
    email: asString(hotel.email),
    phone: asString(hotel.phone),
    rooms,
    amenities,
    policies,
    services,
  };
}

export function normalizeHotelSummary(raw: unknown): HotelSummary | null {
  const record = asRecord(raw);
  const name = asString(record?.name);
  if (!name) return null;
  return { name, address: asString(record?.address) };
}
