// Server component wrapper - required for generateStaticParams with output: "export"
// Service slugs are known at build time so we enumerate them here.
// Next.js 14 with output:"export" treats an empty generateStaticParams the
// same as a missing one (no prerenderRoutes → build error), so we must return
// at least one entry.
import { services } from "@/lib/services";
import SlugPage from "./SlugPage";

// Prevent Next.js from bailing out because the page receives `searchParams`.
// The actual query-string reading happens client-side via window.location.search.
export const dynamic = "force-static";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export default function Page({ params }) {
  return <SlugPage params={params} />;
}