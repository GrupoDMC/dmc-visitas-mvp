export default function Tag({
  children,
  variant = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "accent" | "neutral" | "outline" | "dark";
  className?: string;
}) {
  return <span className={`tag tag-${variant} ${className}`}>{children}</span>;
}
