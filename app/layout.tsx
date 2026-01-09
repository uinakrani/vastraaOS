import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientLayout from "../components/ClientLayout";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "VastraaOS",
  description: "Outfit Rental Order Management and Delivery Handling System",
  manifest: "/manifest.json?v=3",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VastraaOS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full bg-white text-gray-900 ${inter.variable} font-sans`}>
      <body className="antialiased h-full" style={inter.style}>
        <div className="animate-fade-in duration-500 ease-in-out h-full w-full">
          <ClientLayout>{children}</ClientLayout>
        </div>
      </body>
    </html>
  );
}
