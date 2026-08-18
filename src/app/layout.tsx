import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "StudyForge - Build better study habits. Master every subject.",
  description: "The free, student-first productivity platform that helps you organise subjects, track assessments, study effectively, and know exactly what to study next.",
  keywords: ["study", "productivity", "education", "students", "flashcards", "assessments", "learning"],
  authors: [{ name: "StudyForge" }],
  openGraph: {
    title: "StudyForge - Build better study habits",
    description: "Organise subjects, track assessments, study effectively, and know what to study next.",
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
