import "./globals.css";
import RmxRibbon from "@/components/RmxRibbon";
import I18nextProviderClient from "@/app/I18nextProviderClient";

export const metadata = {
  title: "RemEx",
  description:
    "RemEx: Remote Server Execution portal for Remote Explorer Service.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
      </head>
      <body>
        <I18nextProviderClient>
          <RmxRibbon />
          <main className="px-6 py-5 max-w-screen-2xl mx-auto w-full flex-1 min-h-0 overflow-auto">{children}</main>
        </I18nextProviderClient>
      </body>
    </html>
  );
}
