import neo4j, { type Driver } from "neo4j-driver";
import type { AppConfig } from "./config.js";
import type { RetrievalFocus } from "./focus.js";
import {
  normalizeHotelSummary,
  shapeEvidence,
  type Evidence,
  type HotelSummary,
} from "./facts.js";

export type GraphStore = {
  listHotels(): Promise<HotelSummary[]>;
  getEvidence(name: string, focus: RetrievalFocus): Promise<Evidence | null>;
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
