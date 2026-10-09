import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { TrendingUp } from "lucide-react";
import { BackButton } from "./BackButton";
import s from "./founder.module.css";

export const metadata: Metadata = {
  title: "Dennis Lim — Founder & CEO",
  description: "Meet Dennis Lim, Singaporean-Filipino entrepreneur and Founder & CEO of Investure Capital. His journey from bank clerk to e-commerce and technology entrepreneur.",
  openGraph: {
    title: "Dennis Lim — Founder & CEO | Investure Capital",
    description: "From humble beginnings to building a legacy. The story of the founder of Investure Capital.",
    images: [{ url: "/founder/og.webp", width: 1200, height: 630 }],
    type: "profile",
  },
};

/**
 * Public founder profile. Reached from the FAQ ("Who is the founder?") button;
 * no sign-in, no data, so it can be shared outside the app. Editorial cream /
 * navy / gold look on purpose — a profile page, not an app screen.
 */
export default function FounderPage() {
  const back = <Suspense fallback={<span className={s.back}>Back to FAQ</span>}><BackButton className={s.back} /></Suspense>;
  return (
    <div className={s.page} id="top">
      <header className={s.nav}>
        <div className={`${s.container} ${s.navInner}`}>
          {back}
          <span className={s.brand}><TrendingUp style={{ width: 16, height: 16, color: "#d5ae68" }} /> INVESTURE <span>CAPITAL</span></span>
        </div>
      </header>

      <main>
        <section className={s.hero}>
          <div className={`${s.container} ${s.heroInner}`}>
            <div className={s.eyebrow}>Meet the founder</div>
            <h1>Dennis <span>Lim.</span></h1>
            <div className={s.titleline}>Founder &amp; Chief Executive Officer · Investure Capital</div>
            <p className={s.lead}>From humble beginnings to building a legacy. A journey shaped by ambition, resilience and innovation.</p>
            <a className={s.btn} href="#journey">Discover his story <span aria-hidden="true">↓</span></a>
          </div>
        </section>

        <div className={s.strip}>
          <div className={`${s.container} ${s.stripInner}`}>
            <div className={s.stat}><strong>10+ Years</strong><span>Entrepreneurial experience</span></div>
            <span className={s.rule} />
            <div className={s.stat}><strong>E-Commerce</strong><span>Business beginnings</span></div>
            <span className={s.rule} />
            <div className={s.stat}><strong>AI &amp; Tech</strong><span>Business innovation</span></div>
            <span className={s.rule} />
            <div className={s.stat}><strong>Investure</strong><span>Founder &amp; CEO</span></div>
          </div>
        </div>

        <section className={`${s.section} ${s.white}`} id="journey">
          <div className={`${s.container} ${s.twoCol}`}>
            <div className={s.photoFrame}>
              <Image className={`${s.photo} ${s.portrait}`} src="/founder/executive.webp" alt="Dennis Lim at his office desk" width={1000} height={1339} sizes="(max-width: 650px) 100vw, 50vw" priority />
            </div>
            <div className={s.copy}>
              <div className={s.eyebrow}>01 / The beginning</div>
              <h2>Every great journey starts somewhere.</h2>
              <p>Before becoming an entrepreneur, Dennis Lim began his career as a bank clerk. It was a modest beginning that introduced him to the financial world and helped shape his drive to build a better future.</p>
              <p>A Singaporean-Filipino businessman with an entrepreneurial outlook, he eventually took his first steps beyond traditional employment and into the world of online business.</p>
              <p>What started small grew into a much bigger ambition.</p>
            </div>
          </div>
        </section>

        <section className={`${s.section} ${s.sand}`}>
          <div className={`${s.container} ${s.twoCol} ${s.reverseMobile}`}>
            <div className={s.copy}>
              <div className={s.eyebrow}>02 / The entrepreneur</div>
              <h2>From a small online venture to lasting ambition.</h2>
              <p>Dennis entered the world of e-commerce with the determination to learn, adapt and build. Over time, he expanded his experience, growing from an early-stage online entrepreneur into a multimillionaire businessman.</p>
              <p>Across more than a decade in business, his story has been defined by taking initiative, embracing change and exploring what comes next.</p>
              <div className={s.timeline}>
                <div className={s.timelineItem}><strong>Banking beginnings</strong><span>Started his professional journey as a bank clerk.</span></div>
                <div className={s.timelineItem}><strong>E-commerce entrepreneurship</strong><span>Built an online business from a small beginning.</span></div>
                <div className={s.timelineItem}><strong>Business expansion</strong><span>Grew his entrepreneurial experience and explored new ventures.</span></div>
                <div className={s.timelineItem}><strong>Technology &amp; innovation</strong><span>Expanded his interests into AI-driven businesses.</span></div>
              </div>
            </div>
            <div className={s.photoFrame}>
              <Image className={`${s.photo} ${s.portrait}`} src="/founder/leadership.webp" alt="Dennis Lim giving a business presentation" width={1600} height={893} sizes="(max-width: 650px) 100vw, 50vw" />
            </div>
          </div>
        </section>

        <section className={`${s.section} ${s.dark}`}>
          <div className={s.container}>
            <div className={s.eyebrow}>03 / Beyond conventional business</div>
            <h2>Embracing the next wave<br />of innovation.</h2>
            <p style={{ maxWidth: 700 }}>As technology reshapes how businesses operate, Dennis has turned his attention toward artificial intelligence and modern digital solutions — extending his entrepreneurial journey beyond e-commerce.</p>
            <Image className={s.wide} src="/founder/innovation.webp" alt="Dennis Lim working in a technology office" width={1600} height={893} sizes="100vw" />
            <div className={s.features}>
              <div className={s.feature}><span className={s.num}>01</span><h3>Entrepreneurship</h3><p>Learning through experience and building opportunities from the ground up.</p></div>
              <div className={s.feature}><span className={s.num}>02</span><h3>Innovation</h3><p>Exploring technology and artificial intelligence as tools for modern business.</p></div>
              <div className={s.feature}><span className={s.num}>03</span><h3>Long-term vision</h3><p>Looking beyond individual ventures toward meaningful, sustained growth.</p></div>
            </div>
          </div>
        </section>

        <section className={s.section} id="vision">
          <div className={`${s.container} ${s.twoCol}`}>
            <div className={s.photoFrame}>
              <Image className={`${s.photo} ${s.portrait}`} src="/founder/vision.webp" alt="Dennis Lim looking toward a city skyline" width={1600} height={893} sizes="(max-width: 650px) 100vw, 50vw" />
            </div>
            <div className={s.copy}>
              <div className={s.eyebrow}>04 / Investure Capital</div>
              <h2>A new chapter.<br />A broader vision.</h2>
              <p>Today, as Founder and Chief Executive Officer of Investure Capital, Dennis brings together his background in entrepreneurship, his international perspective and his interest in financial technology.</p>
              <p>For Dennis, Investure Capital marks another stage in his journey — an opportunity to pursue innovation, build community and explore what the future of digital finance can become.</p>
              <div className={s.dividerGold} />
              <p><strong style={{ color: "#182b3c" }}>The vision:</strong> Build opportunities through innovation, technology and entrepreneurship.</p>
            </div>
          </div>
        </section>

        <section className={`${s.section} ${s.sand}`} id="message">
          <div className={`${s.container} ${s.twoCol} ${s.reverseMobile}`}>
            <div className={s.copy}>
              <div className={s.eyebrow}>05 / Founder&rsquo;s perspective</div>
              <div className={s.quoteMark} aria-hidden="true">&ldquo;</div>
              <blockquote className={s.quote}>From working behind a bank counter to building businesses, his journey is a testament to ambition, persistence, and the courage to begin.</blockquote>
              <p>His story reflects the belief that beginnings do not have to define destinations — and that learning, resilience and a willingness to embrace change can shape the road ahead.</p>
              <p style={{ fontWeight: 700, color: "#182b3c" }}>Dennis Lim</p>
              <p className={s.note}>Founder &amp; Chief Executive Officer · Investure Capital</p>
            </div>
            <div className={s.photoFrame}>
              <Image className={`${s.photo} ${s.personal}`} src="/founder/personal.webp" alt="Dennis Lim, an approachable portrait" width={1000} height={1241} sizes="(max-width: 650px) 100vw, 50vw" />
            </div>
          </div>
        </section>

        <section className={`${s.section} ${s.dark}`} style={{ padding: "64px 0" }}>
          <div className={`${s.container} ${s.endcap}`}>
            <Image className={s.headshot} src="/founder/headshot.webp" alt="Official headshot of Dennis Lim" width={112} height={112} />
            <div className={s.eyebrow}>The journey continues</div>
            <h2>Building what comes next.</h2>
            <p>Thank you for reading. Head back to the Help &amp; FAQ for everything else about Investure Capital.</p>
            <Suspense fallback={<span className={s.btn}>Back to FAQ</span>}><BackButton className={s.btn} label="Back to FAQ" /></Suspense>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={`${s.container} ${s.footerInner}`}>
          <span className={s.brand}>INVESTURE <span>CAPITAL</span></span>
          <span>Founder &amp; CEO profile · Dennis Lim</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </div>
  );
}
