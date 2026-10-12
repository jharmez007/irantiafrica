"use client";

import { useRef, useState, type FormEvent } from "react";
import { csrfCookie } from "@/lib/auth-api";
import { toast } from "@/lib/toast";
import {
  Button,
  FieldError,
  FormField,
  Input,
  Textarea,
} from "@/components/ui";

type Field = "name" | "email" | "phone" | "subject" | "message";
type Errors = Partial<Record<Field, string>>;
const fields: Field[] = ["name", "email", "phone", "subject", "message"];

export function ContactForm() {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setErrors({});
    const data = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    try {
      const bootstrap = await fetch("/sanctum/csrf-cookie", {
        credentials: "include",
        cache: "no-store",
      });
      if (!bootstrap.ok)
        throw new Error("Unable to start a secure session. Please try again.");
      const response = await fetch("/api/v1/contact", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-XSRF-TOKEN": csrfCookie(document.cookie),
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const nextErrors: Errors = {};
        for (const field of fields) {
          const message = body.error?.fields?.[field]?.[0];
          if (typeof message === "string") nextErrors[field] = message;
        }
        setErrors(nextErrors);
        throw new Error(
          response.status === 429
            ? "Too many messages just now. Please wait before trying again."
            : response.status === 419
              ? "Your security check expired. Please try again."
              : response.status === 503
                ? "Messages are temporarily unavailable. Please try again later."
                : response.status === 422
                  ? "Please check the highlighted fields."
                  : "We couldn't send your message. Please try again.",
        );
      }
      form.current?.reset();
      setSent(true);
      toast.success(
        "Message sent",
        "Thanks for getting in touch. We'll respond as soon as we can.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We couldn't send your message. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} className="contact-form" onSubmit={submit} noValidate>
      {sent && (
        <p className="contact-success" role="status">
          Message sent. Thanks for getting in touch.
        </p>
      )}
      {error && <FieldError>{error}</FieldError>}
      <div className="contact-form-row">
        <div>
          <FormField label="Name" htmlFor="contact-name">
            <Input
              id="contact-name"
              name="name"
              autoComplete="name"
              maxLength={100}
              required
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "contact-name-error" : undefined}
            />
          </FormField>
          {errors.name && (
            <FieldError id="contact-name-error">{errors.name}</FieldError>
          )}
        </div>
        <div>
          <FormField label="Email" htmlFor="contact-email">
            <Input
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              aria-invalid={!!errors.email}
              aria-describedby={
                errors.email ? "contact-email-error" : undefined
              }
            />
          </FormField>
          {errors.email && (
            <FieldError id="contact-email-error">{errors.email}</FieldError>
          )}
        </div>
      </div>
      <div className="contact-form-row">
        <div>
          <FormField label="Phone number (optional)" htmlFor="contact-phone">
            <Input
              id="contact-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={30}
              aria-invalid={!!errors.phone}
              aria-describedby={
                errors.phone ? "contact-phone-error" : undefined
              }
            />
          </FormField>
          {errors.phone && (
            <FieldError id="contact-phone-error">{errors.phone}</FieldError>
          )}
        </div>
        <div>
          <FormField label="Subject" htmlFor="contact-subject">
            <Input
              id="contact-subject"
              name="subject"
              maxLength={140}
              required
              aria-invalid={!!errors.subject}
              aria-describedby={
                errors.subject ? "contact-subject-error" : undefined
              }
            />
          </FormField>
          {errors.subject && (
            <FieldError id="contact-subject-error">{errors.subject}</FieldError>
          )}
        </div>
      </div>
      <div>
        <FormField label="Message" htmlFor="contact-message">
          <Textarea
            id="contact-message"
            name="message"
            maxLength={4000}
            rows={7}
            required
            aria-invalid={!!errors.message}
            aria-describedby={
              errors.message ? "contact-message-error" : undefined
            }
          />
        </FormField>
        {errors.message && (
          <FieldError id="contact-message-error">{errors.message}</FieldError>
        )}
      </div>
      <div className="contact-honeypot" aria-hidden="true">
        <label htmlFor="contact-website">Leave this field empty</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <Button type="submit" loading={busy} loadingLabel="Sending message…">
        Send message
      </Button>
    </form>
  );
}
