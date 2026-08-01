import type { Metadata } from "next";
import { Noto_Serif, Roboto } from "next/font/google";
import "./globals.css";

/*
 * College Board's own design system ("Apricot") sets Roboto for chrome, and the
 * question card in the educator question bank is explicitly `font-family:
 * "Noto Serif"`. Both are self-hosted by next/font so the app matches Bluebook
 * on machines that have neither installed — the previous system-font stack
 * resolved to SF Pro on macOS, which renders ~20% wider than Roboto and made
 * every label sit differently from the reference screenshots.
 */
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-noto-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAT Drill",
  description: "Targeted SAT & PSAT practice from the College Board question bank",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${roboto.variable} ${notoSerif.variable}`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
