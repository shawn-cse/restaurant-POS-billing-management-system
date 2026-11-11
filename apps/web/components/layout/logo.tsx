import Image from "next/image";
import { cn } from "@/lib/utils";

export interface LogoProps {
  className?: string;
  size?: number;
  variant?: "compact" | "horizontal" | "monochrome";
}

export function Logo({
  className,
  size = 32,
  variant = "compact",
}: LogoProps) {
  const src =
    variant === "horizontal"
      ? "/urbanbite-logo-horizontal.svg"
      : variant === "monochrome"
        ? "/urbanbite-logo-receipt.svg"
        : "/urbanbite-logo-compact.svg";

  const width = variant === "horizontal" ? size * 3.5 : size;
  const height = size;

  return (
    <Image
      src={src}
      alt="UrbanBite Restaurant"
      width={width}
      height={height}
      className={cn("shrink-0 object-contain", className)}
      priority
    />
  );
}
