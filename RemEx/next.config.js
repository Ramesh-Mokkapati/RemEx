/** @type {import('next').NextConfig} */

// output: "export" always produces a static site.
// basePath/assetPrefix are only added for the GitHub Pages deployment
// (GITHUB_PAGES=true set in the pages.yml CI workflow).
const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  output: "export",
  ...(isGitHubPages && {
    basePath: "/RemEx",
    assetPrefix: "/RemEx/",
  }),
  experimental: {
    typedRoutes: false,
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = nextConfig;
