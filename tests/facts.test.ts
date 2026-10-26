import neo4j from "neo4j-driver";
import { describe, expect, it } from "vitest";
import { normalizeFactSheet, RECORD_NOTE } from "../src/facts.js";

describe("normalizeFactSheet", () => {
  it("keeps a complete hotel record and sorts the lists", () => {
    const sheet = normalizeFactSheet({
      name: " AnyCompany Cairo Nile View ",
      address: "789 Corniche el-Nil, Cairo 11519, Egypt",
      guest_rating: 4.6,
      total_rooms: neo4j.int(120),
      email: "desk@example.com",
      phone: "",
      rooms: [
        {
          type: "Suite",
          max_occupancy: neo4j.int(4),
          min_rate: 200,
          max_rate: 280,
        },
        {
          type: "Standard Room",
          bed_configuration: "One queen bed",
          max_occupancy: 2,
        },
      ],
      amenities: ["Spa", " Babysitting ", "Pool"],
      policies: [{ name: "Pets", description: "No pets." }],
      services: [
        {
          name: "Airport shuttle",
          cost: "25 USD",
          is_available: true,
          is_complimentary: false,
        },
      ],
    });

    expect(sheet).toMatchObject({
      name: "AnyCompany Cairo Nile View",
      address: "789 Corniche el-Nil, Cairo 11519, Egypt",
      guest_rating: 4.6,
      total_rooms: 120,
      email: "desk@example.com",
      phone: null,
      amenities: ["Babysitting", "Pool", "Spa"],
    });
    expect(sheet?.rooms.map((room) => room.type)).toEqual([
      "Standard Room",
      "Suite",
    ]);
    expect(sheet?.rooms[1]?.max_occupancy).toBe(4);
    expect(sheet?.policies[0]).toEqual({
      name: "Pets",
      description: "No pets.",
    });
    expect(sheet?.services[0]?.name).toBe("Airport shuttle");
    expect(RECORD_NOTE).toMatch(/complete lists/i);
  });

  it("returns null when the hotel has no name", () => {
    expect(normalizeFactSheet({ address: "Somewhere" })).toBeNull();
    expect(normalizeFactSheet(null)).toBeNull();
  });
});
