import neo4j from "neo4j-driver";
import { describe, expect, it } from "vitest";
import { normalizeFactSheet, shapeEvidence } from "../src/facts.js";
import { retrievalFocus } from "../src/focus.js";

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
  });

  it("keeps only the slice the question asked for", () => {
    const raw = {
      name: "AnyCompany Cairo Nile View",
      address: "789 Corniche el-Nil, Cairo 11519, Egypt",
      guest_rating: 4.5,
      total_rooms: 250,
      email: "cairo@anycompany.com",
      phone: "+20-2-555-0001",
      rooms: [{ type: "Suite", max_occupancy: 6, min_rate: 550, max_rate: 900 }],
      amenities: ["Full-Service Spa"],
      policies: [],
      services: [],
    };

    const occupancy = shapeEvidence(raw, retrievalFocus("Does this hotel allow 5 guests?"));
    expect(occupancy).toMatchObject({
      name: "AnyCompany Cairo Nile View",
      guest_count: 5,
      rooms: [{ type: "Suite", max_occupancy: 6 }],
    });
    expect(occupancy).not.toHaveProperty("amenities");
    expect(occupancy).not.toHaveProperty("policies");
    expect(occupancy).not.toHaveProperty("services");
    expect(occupancy?.rooms?.[0]).not.toHaveProperty("min_rate");

    const facility = shapeEvidence(raw, retrievalFocus("Does this hotel have a spa?"));
    expect(facility?.amenities).toEqual(["Full-Service Spa"]);
    expect(facility).not.toHaveProperty("rooms");
    expect(facility).not.toHaveProperty("address");
  });

  it("returns null when the hotel has no name", () => {
    expect(normalizeFactSheet({ address: "Somewhere" })).toBeNull();
    expect(normalizeFactSheet(null)).toBeNull();
  });
});
