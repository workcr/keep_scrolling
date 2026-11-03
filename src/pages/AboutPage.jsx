import Seo from "../components/Seo";
import { SITE, emailHref } from "../site";

export default function AboutPage() {
  return (
    <section className="about-page">
      <Seo
        title={`About — ${SITE.name}, Creative Director`}
        description={SITE.description}
        path="/about"
      />
      <div className="about-hero">
        <img
          src="/assets/rmnds1_by%20Izique_RedOrange.webp"
          alt="Portrait of Rodrigo Mendes against a red-orange background"
          width="2048"
          height="1536"
          fetchPriority="high"
          className="about-hero-image"
        />
      </div>

      <div className="about-content">
        <div className="about-content-grid">
          <div className="about-label">About</div>
          <div className="about-copy">
            <p>
              Rodrigo Mendes is an art-driven Creative Director building brand platforms, campaigns, and
              design systems that connect strategy, visual language, film, digital, and culture.
            </p>
            <p>
              His work is shaped by a background in art direction, typography, and conceptual advertising,
              with 25+ years across Sao Paulo, Portland, and Los Angeles, including Wieden+Kennedy and BBDO.
              He has led work for global brands including Nike and has been recognized by Cannes Lions, Clio,
              D&AD, and The One Show.
            </p>
            <p>
              Rodrigo is especially interested in the systems behind memorable work: the insight, grid,
              voice, references, and production logic that help an idea travel across channels without losing
              its point of view.
            </p>
          </div>
          <div className="about-label">Let&apos;s talk</div>
          <div className="about-links">
            <a
              href="#email"
              className="about-link"
              onClick={(event) => {
                event.preventDefault();
                window.location.href = emailHref();
              }}
            >
              Email
            </a>
            <a href={SITE.instagram} className="about-link" rel="me">
              Instagram
            </a>
            <a href={SITE.linkedin} className="about-link" rel="me">
              LinkedIn
            </a>
          </div>
        </div>
      </div>

      <div className="about-footer-art" aria-hidden="true">
        <img src="/assets/thanks-footer-BMDZGwil.png" alt="" />
      </div>
    </section>
  );
}
