export default function AboutPage() {
  return (
    <section className="about-page">
      <div className="about-hero">
        <img
          src="/src/assets/rmnds1_by%20Izique_RedOrange.webp"
          alt="Portrait with red background"
          className="about-hero-image"
        />
      </div>

      <div className="about-content">
        <div className="about-content-grid">
          <div className="about-label">About</div>
          <div className="about-copy">
            <p>
              Hi! My name is Rodrigo Mendes. I am a creative director with strong strategic thinking, and
              background in Art Direction and Design. I am passionate about crafting ideas and systems that
              help brands make a lasting impact on culture.
            </p>
            <p>
              I have 25+ years of experience, 9 of those years spent working at Wieden+Kennedy. I am
              currently living in LA.
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
            <a href="#" className="about-link">
              LinkedIn
            </a>
          </div>
        </div>
      </div>

      <div className="about-footer-art" aria-hidden="true">
        <img src="/src/assets/thanks-footer-BMDZGwil.png" alt="" />
      </div>
    </section>
  );
}
