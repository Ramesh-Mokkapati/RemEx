// Server component wrapper - required for generateStaticParams with output: "export"
// The actual page logic lives in NodePage.jsx (client component).
//
// Node IPs are discovered at runtime so they cannot be enumerated at build
// time. We pre-generate a single placeholder route ("_") to satisfy the
// Next.js 14 requirement that output:"export" dynamic routes return at least
// one entry from generateStaticParams. Client-side navigation to real IPs
// still works because the SPA router handles all /nodes/[ip] paths.
import NodePage from "./NodePage";

// Prevent Next.js from bailing out because the page receives `searchParams`.
// NodePage reads URL params client-side via window.location.search at runtime.
export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ ip: "_" }];
}

export default function Page({ params }) {
  return <NodePage params={params} />;
}
