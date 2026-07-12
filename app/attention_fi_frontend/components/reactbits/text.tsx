import { cn } from "@/lib/utils";

/** react-bits "Gradient Text" — an animated gradient clipped to the text. */
export function GradientText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("af-gradient-text", className)}>{children}</span>;
}

/** react-bits "Shiny Text" — a shimmer sweeping across muted text. */
export function ShinyText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("af-shiny-text", className)}>{children}</span>;
}
