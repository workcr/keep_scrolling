export default function AboutPage() {
  return (
    <section className="about-page">
      <div className="about-hero">
        <img
          src="/assets/rmnds1_by%20Izique_RedOrange.webp"
          alt="Portrait with red background"
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
            <a href="#" className="about-link">
              Email
            </a>
            <a href="#" className="about-link">
              Instagram
            </a>
            <a href="https://www.linkedin.com/in/rodrigo-mendes-4029b821" className="about-link">
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
