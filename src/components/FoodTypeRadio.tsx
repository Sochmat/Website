import { FOOD_TYPE_OPTIONS, type FoodType } from "@/lib/foodType";
import FoodTypeDot from "./FoodTypeDot";

interface FoodTypeRadioProps {
  value: FoodType;
  onChange: (value: FoodType) => void;
  /** Radio group name — keep it unique per form on the page. */
  name: string;
}

/** Veg / Non-veg / Egg picker, each option prefixed with its marker. */
export default function FoodTypeRadio({
  value,
  onChange,
  name,
}: FoodTypeRadioProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {FOOD_TYPE_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-2 cursor-pointer"
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="w-4 h-4 accent-[#1c1c1c] focus:ring-[#1c1c1c]"
          />
          <FoodTypeDot item={{ foodType: opt.value }} size={14} dotSize={6} />
          <span className="text-sm font-medium text-gray-700">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}
