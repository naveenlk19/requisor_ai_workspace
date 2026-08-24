import { useState, useRef } from "react";
import { motion, useInView, } from "framer-motion";

import PartnerSlider from "@/components/site/PartnerSlider";
import {
  Play,
  Star,
} from "lucide-react";
import davidVideo from "@/assets/testimonials/david-video.mp4";
import davidImg from "@/assets/testimonials/david.jpeg";
import emeliImg from "@/assets/testimonials/emeli.png";
import erinImg from "@/assets/testimonials/erin.png";
export function Testimonials() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const testimonials = [
    {
      quote:
        '" Requisor has been such a lifesaver for consulting projects! Specifically, Requisor has been so helpful in requirements gathering to have it all in one place. When working in other projects it can be so time consuming and hard to keep track of all the information across different platforms. It\'s been so much easier now with Requisor!"',
      author: "Erin Magennis",
      role: "Emerging Science Tech Startup Strategist",
      image: erinImg,
      hasVideo: false,
    },
    {
      quote: "",
      author: "David Nowak",
      role: "Consulting Firm Partner",
      image: davidImg,
      hasVideo: true,
    },
    {
      quote:
        '"Honestly, Requisor feels like the teammate I never had. I used to spend late nights trying to piece together project plans, but now I just write my messy ideas and it gives me clarity in minutes. It\'s taken a huge weight off my shoulders and let me fall back in love with the creative side of my business."',
      author: "Emily kapszukiewicz",
      role: "Startup Founder",
      image: emeliImg,
      hasVideo: false,
    },
  ];

  return (
    <>
      <section ref={sectionRef} id="testimonials" className="py-20 md:py-32 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-medium mb-6 tracking-tight">Teams that ship with clarity</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              See how founders, consultants, and product teams use Requisor to go from conversation to execution.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.15, type: "spring", stiffness: 90, damping: 26 }}
                className="group relative rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_25px_80px_rgba(0,0,0,0.4)] p-6"
              >
                <div className="flex gap-1 mb-4 text-emerald-500">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="w-3 h-3 fill-current" />
                  ))}
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-emerald-600 shadow-lg">
                    <img
                      src={t.image}
                      alt={`${t.author}, ${t.role}`}
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{t.author}</div>
                    <div className="text-sm text-muted-foreground">{t.role}</div>
                  </div>
                </div>

                {!t.hasVideo && <p className="text-sm leading-relaxed text-foreground/80">{t.quote}</p>}

                {t.hasVideo && (
                  <div className="cursor-pointer" onClick={() => setIsVideoPlaying((prev) => !prev)}>
                    {!isVideoPlaying ? (
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800">
                        <video className="w-full h-full object-cover opacity-60" src={davidVideo} muted />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                            <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                          </div>
                        </div>
                        <div className="absolute bottom-3 left-3 right-3">
                          <span className="text-white text-xs font-medium bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                            Watch David's testimonial
                          </span>
                        </div>
                      </div>
                    ) : (
                      <video autoPlay controls className="w-full aspect-video rounded-xl" src={davidVideo} />
                    )}
                  </div>
                )}

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-400/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className=" mb-7 mt-5 dark:bg-[#0D1615]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.16 }}
          className=" flex justify-center"
        >
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-center text-balance">
            Our Partner companies
          </p>
        </motion.div>
        <PartnerSlider />
      </div>
    </>
  );
}
export default Testimonials;
