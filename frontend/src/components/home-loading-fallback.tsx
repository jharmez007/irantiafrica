"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AppScreenLoader } from "@/components/loading";

function subscribeToHashChange(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}

function getHash() {
  return window.location.hash;
}

export function HomeLoadingFallback() {
  // Fragments never reach the server. Render a neutral shell until the browser
  // can distinguish a normal home load from a section link.
  const hash = useSyncExternalStore(
    subscribeToHashChange,
    getHash,
    () => "#collections",
  );
  const sectionNavigation = hash === "#collections" || hash === "#our-story";

  return (
    <main
      id="main-content"
      className={`home-loading${sectionNavigation ? " home-loading--section" : ""}`}
    >
      {!sectionNavigation && (
        <AppScreenLoader label="Preparing your experience…" />
      )}
    </main>
  );
}

export function HomeSectionScroll() {
  useEffect(() => {
    const scrollToSection = () => {
      const section = window.location.hash.slice(1);
      if (section === "collections" || section === "our-story") {
        document.getElementById(section)?.scrollIntoView({ block: "start" });
      }
    };

    scrollToSection();
    window.addEventListener("hashchange", scrollToSection);
    return () => window.removeEventListener("hashchange", scrollToSection);
  }, []);

  return null;
}
