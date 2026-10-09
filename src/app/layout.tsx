import type { Metadata } from "next";
import { Outfit, Work_Sans } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { brand } from "@/config/brand";
import { themeInitScript } from "@/lib/themeScript";
import "./globals.css";

const outfit = Outfit({ variable: "--font-heading-face", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const workSans = Work_Sans({ variable: "--font-body-face", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: `${brand.name} · ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  openGraph: { siteName: brand.name, title: brand.name, description: brand.description, type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme may be changed by the init script before React loads, hence suppressHydrationWarning.
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${outfit.variable} ${workSans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans text-base">
        <Header />
        <main className="page-x w-full flex-1 pt-10 pb-16">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
