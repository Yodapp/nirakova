import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nira Kova — Enter the Frequency",
  description: "An immersive audiovisual experience by Nira Kova.",
  icons: {
    icon: "/nira-portrait.jpeg",
    shortcut: "/nira-portrait.jpeg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
