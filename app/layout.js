import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import InstallPrompt from "@/components/pwa/InstallPrompt";

const geist = Inter({
  subsets: ["latin"],
  variable: "--font-geist",
  weight: ["400", "500", "600"],
  display: "swap",
});

const geistMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: ["400"],
  display: "swap",
});

export const metadata = {
  title: "ANABOLIC GYM",
  description:
    "The paper-register killer. Manage members, renewals, leads, and WhatsApp info from your pocket.",
  manifest: "/manifest.json",
  applicationName: "ANABOLIC GYM",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "ANABOLIC GYM",
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black"
        />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link
          rel="icon"
          href="/icons/favicon-32.png"
          type="image/png"
          sizes="32x32"
        />
        <link rel="icon" href="/icons/icon-192.png" type="image/png" sizes="192x192" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
