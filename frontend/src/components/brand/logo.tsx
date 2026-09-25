import Image from "next/image";
import Link from "next/link";
export function Logo({
  variant = "horizontal",
  linked = true,
  className = "",
}: {
  variant?: "horizontal" | "vertical" | "primary" | "secondary" | "mark";
  linked?: boolean;
  className?: string;
}) {
  const names = {
    horizontal: "horizontal-logo",
    vertical: "vertical-logo",
    primary: "primary-logo",
    secondary: "secondary-logo",
    mark: "favicon-original",
  };
  const artwork = (
    <span className={`logo logo--${variant} ${className}`}>
      <Image
        src={`/assets/brand/${names[variant]}.png`}
        width={501}
        height={501}
        alt="IRANTI Africa — Memories of Nigeria"
        priority={variant === "horizontal"}
      />
    </span>
  );
  return linked ? (
    <Link className="logo-link" href="/" aria-label="IRANTI Africa home">
      {artwork}
    </Link>
  ) : (
    artwork
  );
}
