import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AuthProvider from "./components/auth/AuthProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Briefly Cloud - AI-Powered Document Assistant",
  description: "Transform your documents into intelligent conversations with AI",
  keywords: ["AI", "documents", "chat", "productivity", "OpenAI", "GPT-4"],
  authors: [{ name: "RekonnLabs" }],
  creator: "RekonnLabs",
  publisher: "RekonnLabs",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://briefly.cloud",
    title: "Briefly Cloud - AI-Powered Document Assistant",
    description: "Transform your documents into intelligent conversations with AI",
    siteName: "Briefly Cloud",
  },
  twitter: {
    card: "summary_large_image",
    title: "Briefly Cloud - AI-Powered Document Assistant",
    description: "Transform your documents into intelligent conversations with AI",
    creator: "@rekonnlabs",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          <div id="root">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
