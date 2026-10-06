import type { Metadata } from "next";
import { JetBrains_Mono, Lato } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
});

// Primary font for everything else
const lato = Lato({
  subsets: ["latin"],
  variable: '--font-sans',
  weight: ['300', '400', '700', '900'],
});

export const metadata: Metadata = {
  title: "DevCon-Comm",
  description: "Monthly tech talks and community learning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${lato.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
