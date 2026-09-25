import NextLink from "next/link";
import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactNode,
  type ReactElement,
} from "react";
import { money } from "@/lib/catalog";
export { PasswordInput, Modal, Drawer } from "./interactive";

const classes = (...values: (string | undefined | false)[]) =>
  values.filter(Boolean).join(" ");
export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
}) {
  return (
    <button
      className={classes("button", `button--${variant}`, className)}
      {...props}
    />
  );
}
export function IconButton({
  label,
  className,
  type = "button",
  ...props
}: Omit<ComponentProps<"button">, "aria-label"> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      className={classes("icon-button", className)}
      {...props}
    />
  );
}
export function Link({ className, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink className={classes("text-link", className)} {...props} />;
}
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={classes("input", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={classes("input select", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={classes("input textarea", className)} {...props} />
  );
}
export function Checkbox({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={classes("choice", className)}
      {...props}
    />
  );
}
export function Radio({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  return (
    <input type="radio" className={classes("choice", className)} {...props} />
  );
}
export function FormField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <label htmlFor={htmlFor}>{label}</label>
      {hint && isValidElement(children)
        ? cloneElement(
            children as ReactElement<{ "aria-describedby"?: string }>,
            {
              "aria-describedby": [
                (children.props as { "aria-describedby"?: string })[
                  "aria-describedby"
                ],
                `${htmlFor}-hint`,
              ]
                .filter(Boolean)
                .join(" "),
            },
          )
        : children}
      {hint && (
        <p id={`${htmlFor}-hint`} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
export function FieldError({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <p id={id} className="field-error" role="alert">
      <span aria-hidden="true">!</span> {children}
    </p>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "unavailable";
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
export function Price({
  value,
  max,
}: {
  value: string | null;
  max?: string | null;
}) {
  return (
    <span className="price">
      {value === null ? "Price unavailable" : money(value)}
      {max && max !== value ? ` – ${money(max)}` : ""}
    </span>
  );
}
export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? (
              <NextLink href={item.href}>{item.label}</NextLink>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function Alert({
  children,
  title,
  tone = "error",
}: {
  children: ReactNode;
  title?: string;
  tone?: "error" | "success" | "info";
}) {
  return (
    <div
      className={`alert alert--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="alert-symbol" aria-hidden="true">
        {tone === "error" ? "!" : tone === "success" ? "✓" : "i"}
      </span>
      <div>
        {title && <p className="alert-title">{title}</p>}
        {children}
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <div className="empty-state-rule" aria-hidden="true" />
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </section>
  );
}
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={classes("skeleton", className)}
      {...props}
    />
  );
}
export function Pagination({
  page,
  lastPage,
  href,
  label = "Pagination",
}: {
  page: number;
  lastPage: number;
  href: (page: number) => string;
  label?: string;
}) {
  return (
    <nav className="pagination" aria-label={label}>
      {page > 1 ? (
        <NextLink
          className="button button--secondary"
          href={href(page - 1)}
          rel="prev"
          aria-label="Previous page"
        >
          Previous
        </NextLink>
      ) : (
        <span className="pagination-disabled">Previous</span>
      )}
      <span>
        Page {page} of {Math.max(1, lastPage)}
      </span>
      {page < lastPage ? (
        <NextLink
          className="button button--secondary"
          href={href(page + 1)}
          rel="next"
          aria-label="Next page"
        >
          Next
        </NextLink>
      ) : (
        <span className="pagination-disabled">Next</span>
      )}
    </nav>
  );
}
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={classes("container", className)}>{children}</div>;
}
export function SectionHeader({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {children}
    </div>
  );
}
