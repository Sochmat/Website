// Single source of truth for the societies we currently deliver to.
// Add a new entry here (with its own towers) to start serving another society.

export interface Society {
  /** Stable id used for persistence/selection. */
  id: string;
  /** Society name, e.g. "Pivotal Paradise". */
  name: string;
  /** Sector / area, e.g. "Sector 62". */
  sector: string;
  /** Display label, e.g. "Pivotal Paradise, Sector 62". */
  label: string;
  /** Towers available within this society. */
  towers: string[];
}

export const SOCIETIES: Society[] = [
  {
    id: "pivotal-paradise-sector-62",
    name: "Pivotal Paradise",
    sector: "Sector 62",
    label: "Pivotal Paradise, Sector 62",
    towers: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"],
  },
];

export const DEFAULT_SOCIETY: Society = SOCIETIES[0];

export function getSocietyById(id: string | null | undefined): Society {
  return SOCIETIES.find((s) => s.id === id) ?? DEFAULT_SOCIETY;
}
