import neo4j from "neo4j-driver";
import { evidenceNote, type RetrievalFocus } from "./focus.js";

export type HotelSummary = {
  name: string;
  address: string | null;
};

export type RoomFact = {
  type: string | null;
  bed_configuration?: string | null;
  max_occupancy?: number | null;
  min_rate?: number | null;
  max_rate?: number | null;
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

export type Evidence = {
  name: string;
  note: string;
  guest_count?: number;
  address?: string | null;
  guest_rating?: number | null;
  total_rooms?: number | null;
  email?: string | null;
  phone?: string | null;
  rooms?: RoomFact[];
  amenities?: string[];
  policies?: PolicyFact[];
  services?: ServiceFact[];
};

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

  const rooms: RoomFact[] = [];
  for (const room of asList(hotel.rooms)) {
    const record = asRecord(room);
    if (!record) continue;
    rooms.push({
      type: asString(record.type),
      bed_configuration: asString(record.bed_configuration),
      max_occupancy: asNumber(record.max_occupancy),
      min_rate: asNumber(record.min_rate),
      max_rate: asNumber(record.max_rate),
    });
  }
  rooms.sort((left, right) =>
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

function pickedRoom(room: RoomFact, focus: RetrievalFocus): RoomFact {
  const picked: RoomFact = { type: room.type };
  if (focus.includeBeds) picked.bed_configuration = room.bed_configuration ?? null;
  if (focus.includeOccupancy) picked.max_occupancy = room.max_occupancy ?? null;
  if (focus.includeRates) {
    picked.min_rate = room.min_rate ?? null;
    picked.max_rate = room.max_rate ?? null;
  }
  return picked;
}

export function shapeEvidence(raw: unknown, focus: RetrievalFocus): Evidence | null {
  const hotel = normalizeFactSheet(raw);
  if (!hotel) return null;
  const evidence: Evidence = {
    name: hotel.name,
    note: evidenceNote(focus),
  };
  if (focus.guestCount != null) evidence.guest_count = focus.guestCount;
  if (focus.includeAddress) evidence.address = hotel.address;
  if (focus.includePhone) evidence.phone = hotel.phone;
  if (focus.includeEmail) evidence.email = hotel.email;
  if (focus.includeRating) evidence.guest_rating = hotel.guest_rating;
  if (focus.includeTotalRooms) evidence.total_rooms = hotel.total_rooms;
  if (focus.includeRooms) evidence.rooms = hotel.rooms.map((room) => pickedRoom(room, focus));
  if (focus.includeAmenities) evidence.amenities = hotel.amenities;
  if (focus.includeServices) evidence.services = hotel.services;
  if (focus.includePolicies) evidence.policies = hotel.policies;
  return evidence;
}

export type CatalogSnippet = {
  name: string;
  address?: string | null;
  amenities?: string[];
  policies?: PolicyFact[];
  services?: Array<Pick<ServiceFact, "name" | "description">>;
  rooms?: Array<Pick<RoomFact, "type" | "max_occupancy">>;
};

export type CatalogEvidence = {
  scopeCount: number;
  matchCount: number;
  hotels: CatalogSnippet[];
};

export const CATALOG_NOTE =
  "hotels lists matching properties and only the amenity, policy, service, or room relationship that matched the question. match_count is the full number of matches. scope_count is how many hotels were searched. When question_kind is which, the listed hotels are the matches, including when match_count is below scope_count. When question_kind is all, yes requires match_count to equal scope_count and be greater than zero. An empty hotels list means none matched.";

function compactStrings(values: unknown): string[] {
  return asList(values)
    .map((value) => asString(value))
    .filter((value): value is string => value !== null)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export function normalizeCatalog(raw: unknown): CatalogEvidence {
  const record = asRecord(raw) ?? {};
  const hotels = asList(record.hotels)
    .map((hotel) => {
      const item = asRecord(hotel);
      const name = asString(item?.name);
      if (!item || !name) return null;
      const snippet: CatalogSnippet = { name };
      const address = asString(item.address);
      if (address) snippet.address = address;
      const amenities = compactStrings(item.amenities);
      if (amenities.length > 0) snippet.amenities = amenities;
      const policies = asList(item.policies)
        .map((policy) => {
          const policyRecord = asRecord(policy);
          if (!policyRecord) return null;
          return {
            name: asString(policyRecord.name),
            description: asString(policyRecord.description),
          };
        })
        .filter((policy): policy is PolicyFact => policy !== null);
      if (policies.length > 0) snippet.policies = policies;
      const services = asList(item.services)
        .map((service) => {
          const serviceRecord = asRecord(service);
          const serviceName = asString(serviceRecord?.name);
          if (!serviceName) return null;
          return {
            name: serviceName,
            description: asString(serviceRecord?.description),
          };
        })
        .filter(
          (service): service is { name: string; description: string | null } =>
            service !== null,
        );
      if (services.length > 0) snippet.services = services;
      const rooms = asList(item.rooms)
        .map((room) => {
          const roomRecord = asRecord(room);
          if (!roomRecord) return null;
          return {
            type: asString(roomRecord.type),
            max_occupancy: asNumber(roomRecord.max_occupancy),
          };
        })
        .filter(
          (room): room is { type: string | null; max_occupancy: number | null } =>
            room !== null,
        );
      if (rooms.length > 0) snippet.rooms = rooms;
      return snippet;
    })
    .filter((hotel): hotel is CatalogSnippet => hotel !== null);

  return {
    scopeCount: asNumber(record.scopeCount) ?? 0,
    matchCount: asNumber(record.matchCount) ?? hotels.length,
    hotels,
  };
}

export function normalizeHotelSummary(raw: unknown): HotelSummary | null {
  const record = asRecord(raw);
  const name = asString(record?.name);
  if (!name) return null;
  return { name, address: asString(record?.address) };
}
