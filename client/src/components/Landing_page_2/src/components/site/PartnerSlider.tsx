import logo1 from "/assets2/partners/logo1.png";
import logo2 from "/assets2/partners/logo2.png";
import logo3 from "/partners/logo3.png";
import logo4 from "@/assets2/partners/logo4.png";
import logo5 from "@/assets2/partners/logo5.png";
import logo6 from "@/assets2/partners/logo6.png";
import logo7 from "@/assets2/partners/logo7.png";
import logo8 from "@/assets2/partners/logo8.png";

const logos = [
  { src: logo1, alt: "University of Wisconsin–Milwaukee" },
  { src: logo2, alt: "Staythanks" },
  { src: logo3, alt: "W Cafe" },
  { src: logo4, alt: "MSOE University" },
  { src: logo5, alt: "Partner" },
  { src: logo6, alt: "Squirrel Space" },
  { src: logo7, alt: "BizStarts" },
  { src: logo8, alt: "Kindness for Capital" },
];

const PartnerSlider = () => (
  <div className="relative mt-6 overflow-hidden py-6">
    <h2 className="text-center text-2xl font-semibold mb-6">
      Our Partner Companies
    </h2>
    <div className="flex gap-16 animate-marquee whitespace-nowrap items-center">
      {[...logos, ...logos].map((logo, i) => (
        <img
          key={i}
          src={logo.src}
          alt={logo.alt}
          loading="lazy"
          className="h-20 w-auto object-contain shrink-0 opacity-80 hover:opacity-100 transition-opacity dark:invert-0"
        />
      ))}
    </div>
    <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent" />
    <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent" />
  </div>
);

export default PartnerSlider;
