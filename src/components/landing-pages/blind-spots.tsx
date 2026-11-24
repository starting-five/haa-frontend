type BlindSpotsProps = {
  title: string;
  items: string[];
  suffix: string;
};

export function BlindSpots({ title, items, suffix }: BlindSpotsProps) {
  return (
    <section className="font-sans mx-auto grid w-full max-w-[1200px] gap-0 bg-white px-5 pb-10 pt-[70px] text-[#111111]">
      <h2 className="m-0 max-w-none text-[52px] font-[700] leading-none tracking-[0]">
        {title}
        <span className="text-[#cc007e]">.</span>
      </h2>
      <div className="mt-6 grid gap-4">
        {items.map((item) => (
          <article
            className="rounded-[16px] bg-white p-5 shadow-[0_10px_24px_rgba(17,17,17,0.06)]"
            key={item}
          >
            <p className="m-0 text-[22px] font-normal leading-[1.4] text-[#111111]">
              {item} <span className="font-[800] text-[#cc007e]">{suffix}</span>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
