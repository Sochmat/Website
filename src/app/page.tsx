import Link from "next/link";

const socials = [
  { name: "Dribbble", href: "#" },
  { name: "Instagram", href: "#" },
  { name: "LinkedIn", href: "#" },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#afbbdd] to-[#b5d8ef] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <section className="relative w-full rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-2xl shadow-[#6c7b9b33] backdrop-blur sm:p-10">
          <div className="mx-auto mb-10 w-fit rounded-full border border-[#e8e8ef] bg-white px-5 py-2 text-sm font-semibold text-[#0f1f62] shadow-sm">
            Sochmat
          </div>

          <div className="mx-auto max-w-xl text-center">
            <div className="mb-3 text-4xl">👍🏽</div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[#8f95ab]">
              WE ARE STILL
            </p>
            <h1 className="mt-2 text-balance text-4xl font-bold leading-tight text-[#1d47c7] sm:text-6xl">
              Cooking Our Website.
            </h1>
            <p className="mx-auto mt-6 max-w-md text-lg text-[#6f7486]">
              We are going to launch our website very soon. Stay tuned.
            </p>

            <Link
              href="/register"
              className="mx-auto mt-10 inline-flex items-center gap-3 rounded-full bg-[#11184c] px-5 py-3 text-white shadow-lg shadow-[#11184c44] transition hover:bg-[#1a2260]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1d47c7]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M3 7.5L12 13.5L21 7.5" />
                  <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                </svg>
              </span>
              <span className="font-semibold">Notify Me</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12H19" />
                <path d="M13 6L19 12L13 18" />
              </svg>
            </Link>
          </div>

          <div className="mt-14 flex items-center justify-center gap-3">
            {socials.map((social) => (
              <a
                key={social.name}
                href={social.href}
                aria-label={social.name}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ececf3] bg-white text-xs font-semibold text-[#9aa0b4] shadow-sm transition hover:text-[#1d47c7]"
              >
                {social.name.charAt(0)}
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
