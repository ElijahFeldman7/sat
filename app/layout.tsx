import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
