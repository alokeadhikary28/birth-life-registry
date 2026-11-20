import type { Union } from "@/lib/types";

export type StationType = "union" | "paurashava";
export type MonirampurStationDefinition = {
  id: string;
  bn: string;
  en: string;
  type: StationType;
};
export type Station = Union & { type: StationType };

export const MONIRAMPUR_STATIONS = [
  { id: "mn-pourashava", bn: "মণিরামপুর পৌরসভা", en: "Manirampur Pourashava", type: "paurashava" },
  { id: "mn-rohita", bn: "০১ নং রোহিতা", en: "01 No. Rohita", type: "union" },
  { id: "mn-kashimnagar", bn: "০২ নং কাশিমনগর", en: "02 No. Kashimnagar", type: "union" },
  { id: "mn-bhojgati", bn: "০৩ নং ভোজগাতি", en: "03 No. Bhojgati", type: "union" },
  { id: "mn-dhakuria", bn: "০৪ নং ঢাকুরিয়া", en: "04 No. Dhakuria", type: "union" },
  { id: "mn-haridaskati", bn: "০৫ নং হরিদাসকাটি", en: "05 No. Haridaskati", type: "union" },
  { id: "mn-manirampur", bn: "০৬ নং মণিরামপুর", en: "06 No. Manirampur", type: "union" },
  { id: "mn-khedapara", bn: "০৭ নং খেদাপাড়া", en: "07 No. Khedapara", type: "union" },
  { id: "mn-hariharnagar", bn: "০৮ নং হরিহরনগর", en: "08 No. Hariharnagar", type: "union" },
  { id: "mn-jhanpa", bn: "০৯ নং ঝাঁপা", en: "09 No. Jhanpa", type: "union" },
  { id: "mn-moshmimnagar", bn: "১০ নং মশ্বিমনগর", en: "10 No. Moshmimnagar", type: "union" },
  { id: "mn-chaluahati", bn: "১১ নং চালুয়াহাটি", en: "11 No. Chaluahati", type: "union" },
  { id: "mn-shyamkur", bn: "১২ নং শ্যামকুড়", en: "12 No. Shyamkur", type: "union" },
  { id: "mn-khanpur", bn: "১৩ নং খানপুর", en: "13 No. Khanpur", type: "union" },
  { id: "mn-durbadanga", bn: "১৪ নং দুর্বাডাঙ্গা", en: "14 No. Durbadanga", type: "union" },
  { id: "mn-kultia", bn: "১৫ নং কুলটিয়া", en: "15 No. Kultia", type: "union" },
  { id: "mn-nehalpur", bn: "১৬ নং নেহালপুর", en: "16 No. Nehalpur", type: "union" },
  { id: "mn-monoharpur", bn: "১৭ নং মনোহরপুর", en: "17 No. Monoharpur", type: "union" },
] as const satisfies readonly MonirampurStationDefinition[];

function normalizeStationName(name: string) {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)))
    .replace(/^\s*\d+\s*(?:নং|no\.?|number)\s*/i, "")
    .replace(/য়|য়/g, "য়")
    .replace(/\b(?:union|municipality|pourashava)\b/gi, "")
    .replace(/(?:ইউনিয়ন|ইউনিয়ন|পৌরসভা)/g, "")
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, "");
}

export function resolveMonirampurStation(
  unions: unknown,
  selectedId: string,
): MonirampurStationDefinition | undefined {
  const selected = MONIRAMPUR_STATIONS.find((station) => station.id === selectedId);
  if (!selected || !Array.isArray(unions)) return undefined;

  const selectedNames = new Set([selected.bn, selected.en].map(normalizeStationName));
  const found = unions.some((union) => {
    if (typeof union === "string") {
      return selectedNames.has(normalizeStationName(union));
    }
    if (typeof union !== "object" || union === null || Array.isArray(union)) return false;

    if (
      ("id" in union && union.id === selected.id) ||
      ("union_id" in union && union.union_id === selected.id) ||
      ("station_id" in union && union.station_id === selected.id)
    ) {
      return true;
    }

    return Object.values(union).some(
      (value) => typeof value === "string" && selectedNames.has(normalizeStationName(value)),
    );
  });

  return found ? selected : undefined;
}

export function resolveMonirampurRegistrationUnion(
  unions: unknown,
  selectedId: string,
): MonirampurStationDefinition | undefined {
  const station = resolveMonirampurStation(unions, selectedId);
  return station?.type === "union" ? station : undefined;
}

export function getStationsForUpazila(upazilaId: string, unions: Union[]): Station[] {
  if (upazilaId !== "manirampur") {
    return unions.map((union) => ({
      ...union,
      type:
        /pourashava|municipality/i.test(`${union.id} ${union.en}`) || union.bn.includes("পৌরসভা")
          ? "paurashava"
          : "union",
    }));
  }

  return MONIRAMPUR_STATIONS.map((station) => {
    const existing = unions.find((union) => union.id === station.id);
    return {
      ...(existing ?? { id: station.id, villages: [] }),
      bn: station.bn,
      en: station.en,
      type: station.type,
    };
  });
}

export function getTargetEntryStations(upazilaId: string, unions: Union[]): Station[] {
  const stations = getStationsForUpazila(upazilaId, unions);
  if (upazilaId !== "manirampur") return stations;

  return stations
    .map((station, index) => ({ station, index }))
    .sort(
      (left, right) =>
        Number(left.station.type === "paurashava") - Number(right.station.type === "paurashava") ||
        left.index - right.index,
    )
    .map(({ station }) => station);
}
