import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/ui";
export function AdminShell({
  title,
  description,
  children,
  actions,
  width = "wide",
  parent,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  width?: "wide" | "form";
  parent?: { label: string; href: string };
}) {
  return (
    <div className={`admin-page admin-page--${width}`}>
      <header className="admin-page-heading">
        <div>
          <Breadcrumbs
            items={[
              ...(title === "Dashboard"
                ? []
                : [{ label: "Admin", href: "/admin" }]),
              ...(parent ? [parent] : []),
              { label: title },
            ]}
          />
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="admin-page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
