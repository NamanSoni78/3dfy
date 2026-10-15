import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const SITE = "https://3dfy.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "3Dfy — 3D Name Physics Playground & Mobile 3D Studio",
    template: "%s · 3Dfy",
  },
  description:
    "Turn your name into living 3D with real physics — shake, tilt, squeeze & break it. Then direct camera movies in a phone-first 3D studio with keyframes and frame-perfect video rendering.",
  keywords: [
    "3Dfy", "3D name generator", "physics playground", "3D text", "mobile 3D editor",
    "webGL", "three.js", "rapier physics", "3D studio", "keyframe camera", "video render",
  ],
  applicationName: "3Dfy",
  openGraph: {
    type: "website",
    siteName: "3Dfy",
    title: "3Dfy — 3D Name Physics Playground & Mobile 3D Studio",
    description:
      "Real physics 3D names you can shake, squeeze & break. Plus a phone-first mini-Blender with keyframe cameras and frame-perfect video rendering.",
  },
  twitter: {
    card: "summary_large_image",
    title: "3Dfy — 3D Name Physics Playground",
    description: "Shake it. Break it. Render it. Real 3D physics + a pocket 3D studio.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0e1116",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster position="top-center" theme="dark" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
