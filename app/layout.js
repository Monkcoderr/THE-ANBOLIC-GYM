import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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
  title: "Gym Manager Pro",
  description:
    "The paper-register killer. Manage members, renewals, leads, and WhatsApp nudges from your pocket.",
  manifest: "/manifest.json",
  applicationName: "Gym Manager Pro",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Gym Manager Pro",
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: "#171717",
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
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
