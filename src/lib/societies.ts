// Single source of truth for the societies we currently deliver to.
// Add a new entry here (with its own towers) to start serving another society.

/** A delivery time-window. Times are 24h "HH:MM" strings in IST. */
export interface DeliverySlot {
  /** Order cutoff — the order must be placed before this time, e.g. "12:30". */
  orderBefore: string;
  /** Delivered-by time for orders in this slot, e.g. "13:00". */
  getTill: string;
}

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
  /** Delivery charge (INR) for orders to this society. */
  deliveryCharge: number;
  /**
   * Delivery time-slots. An empty array means delivery is available whenever
   * the store is open (no slot restriction), e.g. Pivotal Paradise. When
   * populated, delivery is only offered while a slot cutoff is still ahead.
   */
  slots: DeliverySlot[];
}

export const SOCIETIES: Society[] = [
  {
    id: "pivotal-paradise-sector-62",
    name: "Pivotal Paradise",
    sector: "Sector 62",
    label: "Pivotal Paradise, Sector 62",
    towers: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"],
    deliveryCharge: 0,
    slots: [],
  },
  {
    id: "zomato-office-sector-62",
    name: "Zomato office",
    sector: "Sector 62",
    label: "Zomato office, Sector 62",
    towers: ["T1", "T2"],
    deliveryCharge: 0,
    slots: [
      { orderBefore: "12:30", getTill: "13:00" },
      { orderBefore: "13:30", getTill: "14:00" },
      { orderBefore: "14:30", getTill: "15:00" },
    ],
  },
];

export const DEFAULT_SOCIETY: Society = SOCIETIES[0];

export function getSocietyById(id: string | null | undefined): Society {
  return SOCIETIES.find((s) => s.id === id) ?? DEFAULT_SOCIETY;
}
