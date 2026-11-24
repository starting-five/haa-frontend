type AccessPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export const instant = false;

export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : "/";
  const hasError = params.error === "1";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0710] px-6 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_20%_15%,rgba(204,0,126,0.34),transparent_58%),radial-gradient(70%_55%_at_88%_88%,rgba(255,92,184,0.24),transparent_62%),linear-gradient(180deg,#120817_0%,#07040c_100%)]" />
      <div className="pointer-events-none absolute -top-20 left-1/2 h-[260px] w-[260px] -translate-x-1/2 rounded-full border border-white/10 blur-2xl" />

      <section className="relative w-full max-w-[420px] rounded-[24px] border border-[#cc007e]/45 bg-[#140a1f]/70 p-7 shadow-[0_24px_70px_rgba(12,6,22,0.72)] backdrop-blur-xl">
        <div className="inline-flex items-center rounded-full border border-[#cc007e]/50 bg-[#cc007e]/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffd5ef]">
          Private Preview
        </div>

        <h1
          className="mt-4 text-[42px] font-extrabold leading-[0.95] text-white"
          style={{ fontFamily: "var(--font-nunito-sans), ui-sans-serif" }}
        >
          Staging Access
        </h1>
        <p
          className="mt-2 text-[15px] text-[#f5d9ec]/85"
          style={{ fontFamily: "var(--font-inter), ui-sans-serif" }}
        >
          Knock to enter.
        </p>

        <form
          action="/access/submit"
          method="post"
          className="mt-6 space-y-3"
        >
          <input
            type="hidden"
            name="next"
            value={next}
          />
          <label
            htmlFor="password"
            className="sr-only"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-[#cc007e]/45 bg-[#2a1336]/80 px-4 py-3 text-[16px] text-white placeholder:text-[#f0c2e1]/45 outline-none transition focus:border-[#ff7fc8] focus:ring-2 focus:ring-[#cc007e]/35"
            placeholder="Enter password"
          />

          {hasError ? <p className="text-sm text-rose-300">Wrong password. Try again.</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-[#cc007e] via-[#e1008c] to-[#ff5cb8] px-4 py-3 text-[15px] font-bold text-white shadow-[0_12px_26px_rgba(204,0,126,0.32)] transition hover:brightness-105"
            style={{ fontFamily: "var(--font-inter), ui-sans-serif" }}
          >
            Unlock
          </button>

          <p className="pt-1 text-center text-[11px] uppercase tracking-[0.12em] text-[#f0c2e1]/55">
            For invited stakeholders
          </p>
        </form>
      </section>
    </main>
  );
}
