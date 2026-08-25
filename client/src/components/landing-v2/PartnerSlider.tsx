import logo1 from "./assets/partners/logo1.png";
import logo2 from "./assets/partners/logo2.png";
import logo3 from "./assets/partners/logo3.png";
import logo4 from "./assets/partners/logo4.png";
import logo5 from "./assets/partners/logo5.png";
import logo6 from "./assets/partners/logo6.png";
import logo7 from "./assets/partners/logo7.png";
import logo8 from "./assets/partners/logo8.png";
import logo9 from "./assets/partners/logo9.png";

const logos = [
  { src: logo1, alt: "University of Wisconsin–Milwaukee" },
  { src: logo2, alt: "Staythanks" },
  { src: logo3, alt: "W Cafe" },
  { src: logo4, alt: "MSOE University" },
  { src: logo5, alt: "Partner" },
  { src: logo6, alt: "Squirrel Space" },
  { src: logo7, alt: "BizStarts" },
  { src: logo8, alt: "Kindness for Capital" },
  { src: logo9, alt: "Newaukee", invertOnLight: true },
];

const PartnerSlider = () => (
  <div className="group/slider relative mt-2 overflow-hidden pt-4 pb-2">
    <h2 className="text-center text-2xl font-semibold mb-6 dark:text-white">
      Our Partner Companies
    </h2>
    <div
      className="flex gap-20 animate-marquee whitespace-nowrap items-center will-change-transform [animation-duration:55s] group-hover/slider:[animation-play-state:paused] motion-reduce:animate-none"
      data-testid="partner-slider-track"
    >
      {[...logos, ...logos].map((logo, i) => (
        <img
          key={i}
          src={logo.src}
          alt={logo.alt}
          loading="lazy"
          draggable={false}
          className={[
            "h-24 md:h-28 w-auto object-contain shrink-0 select-none",
            "grayscale opacity-70 transition-all duration-300 ease-out",
            "hover:grayscale-0 hover:opacity-100 hover:scale-110",
            logo.invertOnLight ? "invert dark:invert-0" : "dark:invert-0",
          ].join(" ")}
          data-testid={`partner-logo-${i % logos.length}`}
        />
      ))}
    </div>
    <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent" />
    <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent" />
  </div>
);

export default PartnerSlider;
