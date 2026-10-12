import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { ContactForm } from "@/components/contact/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with IRANTI Africa about an order or the collection.",
};

export default function ContactPage() {
  return (
    <main id="main-content" className="contact-page">
      <Container>
        <header className="contact-intro">
          <p className="eyebrow">Get in touch</p>
          <h1>We&apos;d love to hear from you.</h1>
          <p>
            Questions about an order, a product, delivery or anything else? Send
            us a message and we&apos;ll get back to you.
          </p>
        </header>
        <div className="contact-layout">
          <section
            className="contact-form-panel"
            aria-labelledby="contact-form-title"
          >
            <p className="eyebrow">Your message</p>
            <h2 id="contact-form-title">Tell us what&apos;s on your mind.</h2>
            <ContactForm />
          </section>
          <aside className="contact-aside">
            <p className="eyebrow">Here to help</p>
            <h2>A thoughtful reply starts here.</h2>
            <p>
              Share a little detail about your question so our team can help.
              For an existing order, include your order number in the message.
            </p>
          </aside>
        </div>
      </Container>
    </main>
  );
}
