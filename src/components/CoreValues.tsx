import Image from "next/image";

const imgCoreValuesBg =
  "https://www.figma.com/api/mcp/asset/13a72c05-0e57-45af-979e-a58004f76dcb";

const coreValues = [
  {
    image: "/body.svg",
    title: "High-Protein, Purpose-Driven Nutrition",
    description:
      "Food that provide meaningful protein that supports strength, recovery, and everyday energy.",
  },
  {
    image: "/noSugar.svg",
    title: "No Added Sugar",
    description: "Sweetness comes naturally from real ingredients.",
  },
  {
    image: "/clean.svg",
    title: "Clean & Natural Ingredients",
    description:
      "Only simple, recognizable ingredients. No artificial colors, flavors, or unnecessary additives.",
  },
  {
    image: "/customer.svg",
    title: "Customer First Approach",
    description:
      "We listen, improve, and build our products around real customer needs, feedback, and lifestyles.",
  },
  {
    image: "/balanced.svg",
    title: "Balanced, Not Extreme",
    description:
      "Food that supports a sustainable, long-term healthy lifestyle, not crash diets or fads.",
  },
];

export default function CoreValues() {
  return (
    <div className="relative bg-[#02583f] min-h-[700px]">
      <div className="absolute inset-0 mix-blend-multiply opacity-30">
        <Image
          src={imgCoreValuesBg}
          alt=""
          fill
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="relative z-10 px-5 py-16">
        <h2 className="text-white text-5xl text-center font-bold uppercase tracking-wider mb-12">
          CORE VALUES
        </h2>
        <div className="flex flex-col gap-6">
          {coreValues.map((value, index) => (
            <div key={index} className="flex gap-3">
              <div className="w-7 h-7 shrink-0">
                <Image
                  src={value.image}
                  alt=""
                  width={28}
                  height={28}
                  className="object-contain"
                  unoptimized
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className="text-[#9eea01] text-base">{value.title}</h3>
                <p className="text-white text-sm font-light leading-5">
                  {value.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
