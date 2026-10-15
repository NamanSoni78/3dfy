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

const SITE = "https://3dfy.namansoni.in";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "3Dfy — Infinite AI 3D Worlds, Studio & Name Playground",
    template: "%s · 3Dfy",
  },
  description:
    "Explore infinite AI-generated 3D worlds and render them into film. Build anything with the full 3D studio, import AI shapes and worlds, and turn your name into living 3D physics — all in your browser.",
  keywords: [
    "3Dfy", "AI world generator", "infinite 3D world", "3D world builder", "3D studio",
    "3D name generator", "physics playground", "3D text", "mobile 3D editor",
    "webGL", "three.js", "rapier physics", "keyframe camera", "video render",
  ],
  applicationName: "3Dfy",
  openGraph: {
    type: "website",
    siteName: "3Dfy",
    title: "3Dfy — Infinite AI 3D Worlds, Studio & Name Playground",
    description:
      "Fly through infinite AI worlds, direct camera films with frame-perfect rendering, and play with your name in real 3D physics.",
    url: SITE,
  },
  twitter: {
    card: "summary_large_image",
    title: "3Dfy — Infinite AI 3D Worlds",
    description: "Explore infinite AI worlds. Render them into film. Break your name in 3D physics.",
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
