"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const INTERVAL_MS = 7000;

// Replace these existing IRANTI images when dedicated campaign photography is approved.
export const heroSlides = [
  {
    eyebrow: "IRANTI AFRICA",
    title: "A little closer to home.",
    body: "Thoughtfully chosen pieces that carry the warmth, beauty and memory of Nigeria with you.",
    ctaLabel: "Explore the collection",
    href: "/products",
    image: "/assets/hero/home-vignette.webp",
    desktopPosition: "center 52%",
    mobilePosition: "55% center",
  },
  {
    eyebrow: "ROOTED IN CRAFT",
    title: "Made with meaning.",
    body: "Discover pieces shaped by local creativity, natural materials and the character of Nigerian craftsmanship.",
    ctaLabel: "Discover the craft",
    href: "/our-story",
    image: "/assets/hero/woven-baskets.webp",
    desktopPosition: "center 48%",
    mobilePosition: "53% center",
  },
  {
    eyebrow: "FOR HOME & LIVING",
    title: "Bring a piece of Nigeria into everyday life.",
    body: "From woven textures to warm ceramics and leather details, find pieces made to live beautifully with you.",
    ctaLabel: "Shop home & living",
    href: "/categories/home-decor",
    image: "/assets/hero/ceramic-incense-still-life.webp",
    desktopPosition: "center 50%",
    mobilePosition: "50% center",
  },
  {
    eyebrow: "SOMETHING TO REMEMBER",
    title: "Gifts that carry a story.",
    body: "Thoughtful pieces for visitors, loved ones and anyone who wants to keep a little of Nigeria close.",
    ctaLabel: "Find a gift",
    href: "/categories/stationery-gifts",
    image: "/assets/hero/leather-heritage-journal.webp",
    desktopPosition: "center 56%",
    mobilePosition: "50% center",
  },
] as const;

function imagePosition(slide: (typeof heroSlides)[number]): CSSProperties {
  return {
    "--hero-position-desktop": slide.desktopPosition,
    "--hero-position-mobile": slide.mobilePosition,
  } as CSSProperties;
}

export function HomeHero({
  availableCategorySlugs = [],
}: {
  availableCategorySlugs?: string[];
}) {
  const [active, setActive] = useState(0);
  const [incoming, setIncoming] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const remaining = useRef(INTERVAL_MS);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    motion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (hovered || focused || !visible || reducedMotion || incoming !== null)
      return;
    let fired = false;
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      fired = true;
      remaining.current = INTERVAL_MS;
      setIncoming((active + 1) % heroSlides.length);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      if (!fired)
        remaining.current = Math.max(
          0,
          remaining.current - (performance.now() - startedAt),
        );
    };
  }, [active, focused, hovered, incoming, reducedMotion, visible]);

  function goTo(index: number) {
    remaining.current = INTERVAL_MS;
    if (index === incoming) return;
    if (index === active) {
      setIncoming(null);
      setFading(false);
      return;
    }
    if (reducedMotion) {
      setActive(index);
      setIncoming(null);
      setFading(false);
      return;
    }
    setFading(false);
    setIncoming(index);
  }

  function finishTransition() {
    if (incoming === null) return;
    setActive(incoming);
    setIncoming(null);
    setFading(false);
    remaining.current = INTERVAL_MS;
  }

  function keepCurrentImage() {
    setIncoming(null);
    setFading(false);
    remaining.current = INTERVAL_MS;
  }

  const slide = heroSlides[active];
  const destination = slide.href.startsWith("/categories/")
    ? availableCategorySlugs.includes(slide.href.slice("/categories/".length))
      ? slide.href
      : "/products"
    : slide.href;

  return (
    <section
      className="home-hero home-hero--campaign"
      aria-roledescription="carousel"
      aria-label="IRANTI Africa stories"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div className="campaign-visual" aria-hidden="true">
        <div className="campaign-slide" style={imagePosition(slide)}>
          <Image
            key={slide.image}
            src={slide.image}
            alt=""
            fill
            sizes="100vw"
            preload={active === 0}
            loading={active === 0 ? undefined : "eager"}
            className="campaign-image"
          />
        </div>
        {incoming !== null && (
          <div
            key={incoming}
            className={`campaign-slide campaign-slide--incoming${fading ? " campaign-slide--visible" : ""}`}
            style={imagePosition(heroSlides[incoming])}
            onTransitionEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.propertyName === "opacity"
              )
                finishTransition();
            }}
          >
            <Image
              src={heroSlides[incoming].image}
              alt=""
              fill
              sizes="100vw"
              loading="eager"
              className="campaign-image"
              onLoad={() => setFading(true)}
              onError={keepCurrentImage}
            />
          </div>
        )}
      </div>
      <div className="campaign-scrim" aria-hidden="true" />
      <div className="container campaign-content">
        <p className="eyebrow">{slide.eyebrow}</p>
        <h1 className={active === 2 ? "campaign-title--long" : undefined}>
          {slide.title}
        </h1>
        <p className="campaign-intro">{slide.body}</p>
        <Link className="button campaign-cta" href={destination}>
          {slide.ctaLabel} <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="container campaign-controls" aria-label="Choose a story">
        <button
          type="button"
          className="campaign-arrow"
          aria-label="Previous story"
          onClick={() =>
            goTo((active - 1 + heroSlides.length) % heroSlides.length)
          }
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className="campaign-dots">
          {heroSlides.map((item, index) => (
            <button
              key={item.eyebrow}
              type="button"
              className="campaign-dot"
              aria-label={`Show story ${index + 1}: ${item.title}`}
              aria-current={active === index ? "true" : undefined}
              onClick={() => goTo(index)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="campaign-arrow"
          aria-label="Next story"
          onClick={() => goTo((active + 1) % heroSlides.length)}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
