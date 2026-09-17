import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { APP_NAME, APP_ORIGIN, APP_TAGLINE, APP_DESCRIPTION } from "@/lib/brand";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: `${APP_NAME} - ${APP_TAGLINE}`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  keywords: ["study", "productivity", "education", "students", "flashcards", "assessments", "learning", "infaix"],
  authors: [{ name: "INFAIX" }],
  openGraph: {
    title: `${APP_NAME} - ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    url: APP_ORIGIN,
    siteName: APP_NAME,
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex-col">
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
