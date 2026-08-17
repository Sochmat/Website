import {
  FOOD_TYPE_COLORS,
  FOOD_TYPE_OPTIONS,
  resolveFoodType,
} from "@/lib/foodType";

interface FoodTypeDotProps {
  /** Anything carrying `foodType` and/or the legacy `isVeg` boolean. */
  item: { foodType?: string | null; isVeg?: boolean };
  /** Outer square, in px. */
  size?: number;
  /** Inner dot, in px. Defaults to half the square. */
  dotSize?: number;
  className?: string;
}

/** Green / red / amber square-and-dot marker. */
export default function FoodTypeDot({
  item,
  size = 16,
  dotSize,
  className = "",
}: FoodTypeDotProps) {
  const foodType = resolveFoodType(item);
  const colors = FOOD_TYPE_COLORS[foodType];
  const inner = dotSize ?? Math.round(size / 2);
  return (
    <div
      role="img"
      aria-label={FOOD_TYPE_OPTIONS.find((o) => o.value === foodType)?.label}
      className={`border-2 shrink-0 flex items-center justify-center ${colors.border} ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        className={`rounded-full ${colors.dot}`}
        style={{ width: inner, height: inner }}
      />
    </div>
  );
}
