import neo4j, { type Driver } from "neo4j-driver";
import type { AppConfig } from "./config.js";
import {
  normalizeFactSheet,
  normalizeHotelSummary,
  type FactSheet,
  type HotelSummary,
} from "./facts.js";

export type GraphStore = {
  listHotels(): Promise<HotelSummary[]>;
  getFactSheet(name: string): Promise<FactSheet | null>;
  close(): Promise<void>;
};

const LIST_HOTELS = `
MATCH (hotel:Hotel)
WHERE hotel.name IS NOT NULL
RETURN hotel.name AS name, hotel.address AS address
ORDER BY hotel.name
`;

const FACT_SHEET = `
MATCH (hotel:Hotel {name: $name})
RETURN hotel {
  .name,
  .address,
  .guest_rating,
  .total_rooms,
  .email,
  .phone,
  rooms: [(hotel)-[:HAS_ROOM]->(room:Room) | room {
    .type,
    .bed_configuration,
    .max_occupancy,
    .min_rate,
    .max_rate
  }],
  amenities: [(hotel)-[:OFFERS_AMENITY]->(amenity:Amenity) | amenity.name],
  policies: [(hotel)-[:HAS_POLICY]->(policy:Policy) | policy {
    .name,
    .description
  }],
  services: [(hotel)-[:PROVIDES_SERVICE]->(service:Service) | service {
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

  async getFactSheet(name: string): Promise<FactSheet | null> {
    const rows = await this.read(FACT_SHEET, { name });
    const hotel = rows[0]?.hotel;
    return normalizeFactSheet(hotel);
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  private async read(
    cypher: string,
    parameters: Record<string, string>,
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
