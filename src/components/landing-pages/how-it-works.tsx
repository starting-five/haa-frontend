import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type HowItWorksStepCopy = {
  title: string;
  description: string;
};

export type HowItWorksSingleImage = {
  src: string;
  fit?: "cover" | "contain";
  position?: string;
  scale?: number;
};

export type HowItWorksStepImage = string | HowItWorksSingleImage;

export type HowItWorksStep = HowItWorksStepCopy & {
  image: HowItWorksStepImage;
};

export function withHowItWorksImages(steps: HowItWorksStepCopy[], images: HowItWorksStepImage[]): HowItWorksStep[] {
  return steps.map((step, index) => ({
    ...step,
    image: images[index],
  }));
}

type HowItWorksProps = {
  title: string;
  lead: string;
  cta: {
    label: string;
    href: string;
  };
  closingText?: string;
  closingSubtext?: string;
  steps: HowItWorksStep[];
};

export function HowItWorks({ title, lead, cta, closingText, closingSubtext, steps }: HowItWorksProps) {
  const leadParts = lead.split(".").filter(Boolean);

  return (
    <section className="mx-auto grid w-full max-w-[1680px] gap-10 bg-white px-5 py-[64px]">
      <div>
        <h2 className="font-sans m-0 max-w-[760px] text-[18px] font-[700] leading-[1.25] tracking-[0]">
          {title}
          <span className="ml-1 inline-block size-1.5 rounded-full bg-[#cc007e] align-baseline" />
        </h2>
        {lead && (
          <p
            className="mt-3 max-w-[760px] text-[40px] font-[800] leading-[1.08] tracking-[0] text-black"
            aria-label={lead}
          >
            <span aria-hidden="true">
              {leadParts.map((part, index) => (
                <span key={`${part}-${index}`}>
                  {part}
                  {index < leadParts.length && (
                    <>
                      <span
                        className={cn(
                          "inline-block size-2 rounded-full bg-[#cc007e] align-baseline",
                          index === 0 && "-ml-px"
                        )}
                      />{" "}
                    </>
                  )}
                </span>
              ))}
            </span>
          </p>
        )}
      </div>

      <div className="relative grid max-w-[720px] gap-12 pl-6 max-[520px]:gap-10 max-[520px]:pl-5">
        {steps.map((step, index) => {
          const isFirst = index === 0;
          const isLast = index === steps.length - 1;
          const singleImage: HowItWorksSingleImage =
            typeof step.image === "string"
              ? {
                  src: step.image,
                  fit: isFirst || isLast ? "contain" : "cover",
                }
              : step.image;

          return (
            <article
              className="relative grid gap-[18px]"
              key={step.title}
            >
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute -left-5 bottom-[-48px] top-3 w-px bg-black max-[520px]:bottom-[-40px]"
                />
              )}
              {isFirst && (
                <span
                  aria-hidden="true"
                  className="absolute -left-[26px] top-0 z-[1] size-[13px] rounded-full bg-[#cc007e]"
                />
              )}
              {isLast && (
                <span
                  aria-hidden="true"
                  className="absolute -left-7 top-0 z-[1] h-3.5 w-[17px] rounded-[3px] bg-[#cc007e] [clip-path:polygon(50%_0,100%_100%,0_100%)]"
                />
              )}
              {!isFirst && !isLast && (
                <span
                  aria-hidden="true"
                  className="absolute -left-[26px] top-0 z-[1] grid size-3 place-items-center border-0 bg-white shadow-none outline-none"
                >
                  <span className="block size-2.5 bg-black" />
                </span>
              )}
              <div className="relative aspect-video w-full overflow-hidden">
                <Image
                  src={singleImage.src}
                  alt=""
                  width={720}
                  height={405}
                  className={cn(
                    "block h-full w-full object-center",
                    singleImage.fit === "contain" ? "object-contain" : "object-cover",
                    singleImage.position
                  )}
                  style={singleImage.scale ? { transform: `scale(${singleImage.scale})` } : undefined}
                />
              </div>
              <div className="font-sans grid gap-3 pl-2">
                <h3 className="m-0 text-[22px] font-[850] leading-[1.18] tracking-[0]">
                  {index + 1}. {step.title}
                </h3>
                <p className="m-0 text-[17px] font-normal leading-[1.5]">{step.description}</p>
              </div>
            </article>
          );
        })}
      </div>

      {closingText && (
        <div className="grid max-w-[760px] gap-3">
          <p className="font-inter m-0 text-[40px] font-[800] leading-[1.08] tracking-[0] text-black">{closingText}</p>
          {closingSubtext && (
            <p className="font-inter m-0 max-w-[640px] text-[18px] font-[500] leading-[1.32] text-[#555555]">
              {closingSubtext}
            </p>
          )}
        </div>
      )}

      <Link
        className="font-nunito mt-8 inline-flex min-h-[56px] min-w-[240px] items-center justify-center rounded-[16px] bg-[#cc007e] px-[22px] text-[18px] font-[700] text-white max-[520px]:w-full max-[520px]:min-w-0"
        href={cta.href}
      >
        {cta.label}
      </Link>
    </section>
  );
}
