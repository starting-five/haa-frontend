import { Check } from "lucide-react";

type FeatChecklistProps = {
  heading: string[];
  items: string[];
};

export function FeatChecklist({ heading, items }: FeatChecklistProps) {
  return (
    <section className="mx-auto grid w-full max-w-[1680px] gap-12 bg-white px-5 pb-16 pt-12 text-black">
      <h2 className="font-sans m-0 text-[40px] font-[700] leading-none tracking-[0] text-[#111111]">
        {heading.map((part) => (
          <span
            className="mr-3 inline-block whitespace-nowrap"
            key={part}
          >
            {part}
            <span className=" inline-block size-2 rounded-full bg-[#cc007e] align-baseline" />
          </span>
        ))}
      </h2>

      <ul className="m-0 grid max-w-[1200px] list-none gap-x-9 gap-y-[18px] p-0">
        {items.map((item) => (
          <li
            className="font-nunito relative flex items-start gap-3 text-[18px] font-normal leading-[1.4]"
            key={item}
          >
            <Check
              className="mt-1 h-[22px] w-[22px] shrink-0 text-[#cc007e]"
              strokeWidth={3}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
