export default function VegDot({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
      className={`w-3.5 h-3.5 border-2 shrink-0 flex items-center justify-center ${
        isVeg ? "border-green-600" : "border-red-600"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isVeg ? "bg-green-600" : "bg-red-600"}`}
      />
    </span>
  );
}
