import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: { absolute: "Our Story | IRANTI Africa" },
  description:
    "IRANTI AFRICA celebrates Nigeria's beauty, culture, creativity and heritage through thoughtfully curated, locally made products created by Nigerian artisans and businesses.",
};

export default function OurStoryPage() {
  return (
    <main id="main-content" className="our-story-page">
      <section className="our-story-hero" aria-labelledby="our-story-title">
        <Container className="our-story-hero-grid">
          <div className="our-story-hero-copy">
            <p className="eyebrow">Our story · IRANTI AFRICA</p>
            <h1 id="our-story-title">A Piece of Nigeria, Wherever You Go.</h1>
            <p>
              IRANTI AFRICA is a Nigerian owned souvenir brand dedicated to
              celebrating the beauty, culture, creativity, and heritage of
              Nigeria through thoughtfully curated, locally made products
              created by Nigerian artisans and businesses.
            </p>
            <div className="our-story-hero-actions">
              <a className="our-story-discover" href="#the-meaning">
                Discover our story <span aria-hidden="true">↓</span>
              </a>
              <Link className="text-link" href="/products">
                Explore the collection <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
          <div className="our-story-hero-art">
            <div className="our-story-image our-story-hero-image">
              <Image
                src="/assets/categories/sunlit_earthy_boho_vignette.png"
                alt="Warm home vignette with a ceramic vase, patterned cushion and wooden bowl"
                width={1254}
                height={1254}
                priority
              />
            </div>
            <span className="our-story-hero-caption" aria-hidden="true">
              Crafted to be remembered
            </span>
          </div>
        </Container>
      </section>

      <section
        className="our-story-meaning"
        id="the-meaning"
        aria-labelledby="our-story-meaning-title"
      >
        <Container className="our-story-meaning-grid">
          <div className="our-story-meaning-art">
            <span className="our-story-section-number" aria-hidden="true">
              01 / THE NAME
            </span>
            <p className="our-story-word" lang="yo">
              Ìrántí
            </p>
            <span className="our-story-meaning-translation">A memory.</span>
          </div>
          <div className="our-story-meaning-copy">
            <p className="eyebrow">The meaning in our name</p>
            <h2 id="our-story-meaning-title">A memory worth keeping.</h2>
            <p>
              Our name, <span lang="yo">Ìrántí</span>, means “memory” in Yoruba,
              reflecting our belief that the best souvenirs do more than remind
              us of a place; they preserve the stories, experiences, and
              emotions that make it special.
            </p>
          </div>
        </Container>
      </section>

      <section
        className="our-story-editorial"
        aria-labelledby="our-story-artisans-title"
      >
        <Container className="our-story-editorial-grid">
          <div className="our-story-editorial-art">
            <div className="our-story-image our-story-editorial-image">
              <Image
                src="/assets/categories/sunlit_woven_baskets_and_olive_greenery.png"
                alt="Woven baskets with leather handles in a sunlit setting"
                width={1254}
                height={1254}
              />
            </div>
            <span className="our-story-art-note" aria-hidden="true">
              Made with meaning.
            </span>
          </div>
          <div className="our-story-editorial-copy">
            <p className="eyebrow">02 / Local creativity</p>
            <h2 id="our-story-artisans-title">Made closer to home.</h2>
            <p>
              We collaborate with local artisans and Nigerian owned businesses
              to bring unique products inspired by Nigeria’s rich cultural
              heritage to a global audience.
            </p>
            <div className="our-story-editorial-detail" aria-hidden="true">
              <Image
                src="/assets/hero/heritage-crossbody-bag.webp"
                alt=""
                width={220}
                height={260}
              />
              <span>
                Objects for the journey, and the memories that follow.
              </span>
            </div>
          </div>
        </Container>
      </section>

      <section
        className="our-story-mission"
        aria-labelledby="our-story-mission-title"
      >
        <Container className="our-story-mission-grid">
          <div>
            <p className="eyebrow">03 / Our mission</p>
            <h2 id="our-story-mission-title">
              Celebrating Nigerian creativity.
            </h2>
          </div>
          <p>
            At IRANTI AFRICA, we believe Nigerian-made products deserve to be
            celebrated, shared, and appreciated both locally and
            internationally. Our mission is to make Nigerian souvenirs more
            accessible while supporting local craftsmanship and showcasing the
            creativity that makes our culture unique.
          </p>
        </Container>
      </section>

      <section
        className="our-story-audience"
        aria-labelledby="our-story-audience-title"
      >
        <Container className="our-story-audience-grid">
          <div className="our-story-audience-copy">
            <p className="eyebrow">04 / For every journey</p>
            <h2 id="our-story-audience-title">Something worth remembering.</h2>
            <p>
              Whether you are a visitor discovering Nigeria for the first time,
              a Nigerian celebrating your roots, or someone looking for a
              meaningful gift, we want you to find something worth remembering.
            </p>
            <div className="our-story-audience-words" aria-hidden="true">
              <span>Discover</span>
              <span>Celebrate</span>
              <span>Give</span>
            </div>
          </div>
          <div className="our-story-image our-story-audience-image">
            <Image
              src="/assets/hero/ceramic-incense-still-life.webp"
              alt="Ceramic incense holder in a warm, sunlit setting"
              width={1254}
              height={1254}
            />
          </div>
        </Container>
      </section>

      <section
        className="our-story-closing"
        aria-labelledby="our-story-closing-title"
      >
        <Container className="our-story-narrow">
          <p className="eyebrow">The story continues with you</p>
          <h2 id="our-story-closing-title">
            IRANTI AFRICA — Taking a piece of Nigeria with you, wherever life
            takes you.
          </h2>
          <Link className="button button--primary" href="/products">
            Explore the collection <span aria-hidden="true">↗</span>
          </Link>
        </Container>
      </section>
    </main>
  );
}
