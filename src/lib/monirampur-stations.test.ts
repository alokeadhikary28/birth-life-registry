import { describe, expect, it } from "vitest";
import {
  getStationsForUpazila,
  getTargetEntryStations,
  MONIRAMPUR_STATIONS,
  resolveMonirampurRegistrationUnion,
  resolveMonirampurStation,
} from "./monirampur-stations";
import { seedState } from "./seed";

describe("Monirampur station registry", () => {
  it("contains one paurashava and all 17 unions with unique station IDs", () => {
    expect(MONIRAMPUR_STATIONS).toHaveLength(18);
    expect(MONIRAMPUR_STATIONS.filter((station) => station.type === "union")).toHaveLength(17);
    expect(MONIRAMPUR_STATIONS.filter((station) => station.type === "paurashava")).toHaveLength(1);
    expect(new Set(MONIRAMPUR_STATIONS.map((station) => station.id)).size).toBe(18);
  });

  it("drives seeded stations and the UNO station list", () => {
    const monirampur = seedState().upazilas.find((upazila) => upazila.id === "manirampur")!;
    const stations = getStationsForUpazila(monirampur.id, monirampur.unions);

    expect(stations).toHaveLength(18);
    expect(stations.find((station) => station.id === "mn-pourashava")?.type).toBe("paurashava");
    expect(stations.find((station) => station.id === "mn-dhakuria")?.bn).toBe("০৪ নং ঢাকুরিয়া");
  });

  it("orders target-entry rows as unions 01-17 followed by paurashava 18", () => {
    const monirampur = seedState().upazilas.find((upazila) => upazila.id === "manirampur")!;
    const stations = getTargetEntryStations(monirampur.id, monirampur.unions);

    expect(stations).toHaveLength(18);
    expect(stations.slice(0, 17).every((station) => station.type === "union")).toBe(true);
    expect(stations[0]).toMatchObject({ id: "mn-rohita", bn: "০১ নং রোহিতা" });
    expect(stations[16]).toMatchObject({ id: "mn-monoharpur", bn: "১৭ নং মনোহরপুর" });
    expect(stations[17]).toMatchObject({
      id: "mn-pourashava",
      bn: "মণিরামপুর পৌরসভা",
      type: "paurashava",
    });
  });

  it("resolves every registration union by ID or normalized database name", () => {
    const databaseUnions = MONIRAMPUR_STATIONS.map((station) => ({
      station_id: `legacy-${station.id}`,
      name_bn: station.bn.replace(/^[০-৯]+\s*নং\s*/, ""),
      name_en: station.en.replace(/^\d+\s*No\.\s*/i, ""),
    }));

    for (const station of MONIRAMPUR_STATIONS.filter((item) => item.type === "union")) {
      expect(resolveMonirampurRegistrationUnion(databaseUnions, station.id)).toMatchObject({
        id: station.id,
        en: station.en,
      });
    }
  });

  it("resolves Dhakuria despite legacy Bengali spelling and field names", () => {
    expect(
      resolveMonirampurRegistrationUnion(
        [{ name_bn: "০৪ নং ঢাকুরিয়া", name_en: "04 No. Dhakuria" }],
        "mn-dhakuria",
      ),
    ).toMatchObject({ id: "mn-dhakuria", en: "04 No. Dhakuria" });
  });

  it("resolves a union when the database stores names as plain strings", () => {
    const station = resolveMonirampurRegistrationUnion(
      ["০৪ নং ঢাকুরিয়া", "05 No. Kha"],
      "mn-dhakuria",
    );
    expect(station).toMatchObject({ id: "mn-dhakuria", en: "04 No. Dhakuria" });
  });

  it("does not allow the paurashava in the field-staff union registration flow", () => {
    expect(
      resolveMonirampurRegistrationUnion(
        [{ id: "mn-pourashava", bn: "মণিরামপুর পৌরসভা", en: "Manirampur Pourashava" }],
        "mn-pourashava",
      ),
    ).toBeUndefined();
    expect(
      resolveMonirampurStation(
        [{ id: "mn-pourashava", bn: "মণিরামপুর পৌরসভা", en: "Manirampur Pourashava" }],
        "mn-pourashava",
      ),
    ).toBeDefined();
  });
});
