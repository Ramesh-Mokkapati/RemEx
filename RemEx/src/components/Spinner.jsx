/**
 * Spinner — inline SVG loading indicator.
 *
 * Props:
 *   size  "xs" | "sm" | "md" | "lg" | "xl"  (default "sm")
 *   className  extra Tailwind classes (e.g. custom colour)
 *
 * Colour defaults to text-rmx-primary; override via className.
 */
export default function Spinner({ size = "sm", className = "" }) {
  const dim = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
    xl: "w-8 h-8",
  }[size] ?? "w-4 h-4";

  return (
    <svg
      className={`animate-spin ${dim} text-rmx-primary ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
