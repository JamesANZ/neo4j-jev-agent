import neo4j, { type Driver } from "neo4j-driver";
import type { AppConfig } from "./config.js";
import type { RetrievalFocus } from "./focus.js";
import {
  asNumber,
  normalizeCatalog,
  normalizeHotelSummary,
  shapeEvidence,
  type CatalogEvidence,
  type Evidence,
  type HotelSummary,
} from "./facts.js";

export const CATALOG_LIMIT = 40;

export type GraphStore = {
  listHotels(): Promise<HotelSummary[]>;
  getEvidence(name: string, focus: RetrievalFocus): Promise<Evidence | null>;
  searchHotels(focus: RetrievalFocus, names: string[]): Promise<CatalogEvidence>;
  close(): Promise<void>;
};

const LIST_HOTELS = `
MATCH (hotel:Hotel)
WHERE hotel.name IS NOT NULL
RETURN hotel.name AS name, hotel.address AS address
ORDER BY hotel.name
`;

const EVIDENCE = `
MATCH (hotel:Hotel {name: $name})
RETURN hotel {
  .name,
  address: CASE WHEN $includeAddress THEN hotel.address ELSE null END,
  guest_rating: CASE WHEN $includeRating THEN hotel.guest_rating ELSE null END,
  total_rooms: CASE WHEN $includeTotalRooms THEN hotel.total_rooms ELSE null END,
  email: CASE WHEN $includeEmail THEN hotel.email ELSE null END,
  phone: CASE WHEN $includePhone THEN hotel.phone ELSE null END,
  rooms: [(hotel)-[:HAS_ROOM]->(room:Room) WHERE $includeRooms | room {
    .type,
    .bed_configuration,
    .max_occupancy,
    .min_rate,
    .max_rate
  }],
  amenities: [(hotel)-[:OFFERS_AMENITY]->(amenity:Amenity)
    WHERE $includeAmenities AND any(term IN $terms WHERE toLower(amenity.name) CONTAINS term)
    | amenity.name],
  policies: [(hotel)-[:HAS_POLICY]->(policy:Policy)
    WHERE $includePolicies AND any(term IN $terms WHERE
      toLower(coalesce(policy.name, "")) CONTAINS term OR
      toLower(coalesce(policy.description, "")) CONTAINS term)
    | policy { .name, .description }],
  services: [(hotel)-[:PROVIDES_SERVICE]->(service:Service)
    WHERE $includeServices AND any(term IN $terms WHERE
      toLower(coalesce(service.name, "")) CONTAINS term OR
      toLower(coalesce(service.description, "")) CONTAINS term)
    | service {
      .name,
      .description,
      .cost,
      .hours,
      .is_available,
      .is_complimentary
    }]
} AS hotel
`;

const SCOPE_COUNT = `
MATCH (hotel:Hotel)
WHERE hotel.name IS NOT NULL
  AND (size($names) = 0 OR hotel.name IN $names)
RETURN count(hotel) AS scopeCount
`;

const SEARCH_HOTELS = `
MATCH (hotel:Hotel)
WHERE hotel.name IS NOT NULL
  AND (size($names) = 0 OR hotel.name IN $names)
  AND ($guestCount IS NULL OR EXISTS {
    MATCH (hotel)-[:HAS_ROOM]->(room:Room)
    WHERE room.max_occupancy >= $guestCount
  })
  AND (
    size($terms) = 0
    OR all(term IN $terms WHERE
      toLower(hotel.name) CONTAINS term
      OR toLower(coalesce(hotel.address, "")) CONTAINS term
      OR ($includeAmenities AND EXISTS {
        MATCH (hotel)-[:OFFERS_AMENITY]->(amenity:Amenity)
        WHERE toLower(amenity.name) CONTAINS term
      })
      OR ($includeServices AND EXISTS {
        MATCH (hotel)-[:PROVIDES_SERVICE]->(service:Service)
        WHERE (
          toLower(coalesce(service.name, "")) CONTAINS term
          OR toLower(coalesce(service.description, "")) CONTAINS term
        )
        AND NOT (
          toLower(coalesce(service.description, "")) CONTAINS "not available"
          OR toLower(coalesce(service.description, "")) CONTAINS "unavailable"
          OR toLower(coalesce(service.description, "")) CONTAINS "not offered"
        )
      })
      OR ($includePolicies AND EXISTS {
        MATCH (hotel)-[:HAS_POLICY]->(policy:Policy)
        WHERE toLower(coalesce(policy.name, "")) CONTAINS term
          OR toLower(coalesce(policy.description, "")) CONTAINS term
      })
      OR ($includeRooms AND EXISTS {
        MATCH (hotel)-[:HAS_ROOM]->(room:Room)
        WHERE toLower(coalesce(room.type, "")) CONTAINS term
      })
    )
  )
WITH hotel
ORDER BY hotel.name
WITH collect(hotel {
  .name,
  .address,
  amenities: [(hotel)-[:OFFERS_AMENITY]->(amenity:Amenity)
    WHERE $includeAmenities
      AND any(term IN $terms WHERE toLower(amenity.name) CONTAINS term)
    | amenity.name],
  policies: [(hotel)-[:HAS_POLICY]->(policy:Policy)
    WHERE $includePolicies AND any(term IN $terms WHERE
      toLower(coalesce(policy.name, "")) CONTAINS term
      OR toLower(coalesce(policy.description, "")) CONTAINS term)
    | policy { .name, .description }],
  services: [(hotel)-[:PROVIDES_SERVICE]->(service:Service)
    WHERE $includeServices
      AND any(term IN $terms WHERE
        toLower(coalesce(service.name, "")) CONTAINS term
        OR toLower(coalesce(service.description, "")) CONTAINS term)
      AND NOT (
        toLower(coalesce(service.description, "")) CONTAINS "not available"
        OR toLower(coalesce(service.description, "")) CONTAINS "unavailable"
        OR toLower(coalesce(service.description, "")) CONTAINS "not offered"
      )
    | service { .name, .description }],
  rooms: [(hotel)-[:HAS_ROOM]->(room:Room)
    WHERE ($guestCount IS NOT NULL AND room.max_occupancy >= $guestCount)
      OR ($includeRooms AND any(term IN $terms WHERE toLower(coalesce(room.type, "")) CONTAINS term))
    | room { .type, .max_occupancy }]
}) AS matched
RETURN size(matched) AS matchCount, matched[0..$limit] AS hotels
`;

export function createGraphStore(config: AppConfig): GraphStore {
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword),
  );
  return new Neo4jGraphStore(driver, config.neo4jDatabase);
}

class Neo4jGraphStore implements GraphStore {
  constructor(
    private readonly driver: Driver,
    private readonly database: string,
  ) {}

  async listHotels(): Promise<HotelSummary[]> {
    const rows = await this.read(LIST_HOTELS, {});
    return rows
      .map((row) => normalizeHotelSummary(row))
      .filter((hotel): hotel is HotelSummary => hotel !== null);
  }

  async getEvidence(name: string, focus: RetrievalFocus): Promise<Evidence | null> {
    const rows = await this.read(EVIDENCE, {
      name,
      terms: focus.terms,
      includeRooms: focus.includeRooms,
      includeAddress: focus.includeAddress,
      includeRating: focus.includeRating,
      includeTotalRooms: focus.includeTotalRooms,
      includeEmail: focus.includeEmail,
      includePhone: focus.includePhone,
      includeAmenities: focus.includeAmenities,
      includePolicies: focus.includePolicies,
      includeServices: focus.includeServices,
    });
    return shapeEvidence(rows[0]?.hotel, focus);
  }

  async searchHotels(focus: RetrievalFocus, names: string[]): Promise<CatalogEvidence> {
    const parameters = {
      names,
      terms: focus.terms,
      guestCount: focus.guestCount,
      includeAmenities: focus.includeAmenities,
      includeServices: focus.includeServices,
      includePolicies: focus.includePolicies,
      includeRooms: focus.includeRooms,
      limit: CATALOG_LIMIT,
    };
    const [scopeRows, matchRows] = await Promise.all([
      this.read(SCOPE_COUNT, { names }),
      this.read(SEARCH_HOTELS, parameters),
    ]);
    const found = normalizeCatalog(matchRows[0] ?? { hotels: [], matchCount: 0 });
    return {
      ...found,
      scopeCount: asNumber(scopeRows[0]?.scopeCount) ?? 0,
    };
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  private async read(
    cypher: string,
    parameters: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(cypher, parameters);
      return result.records.map((record) => record.toObject());
    } finally {
      await session.close();
    }
  }
}
