import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "GBP Rank Tracker - Local SEO Tools",
    description: "Enterprise grade local SEO tracking",
    manifest: "/manifest.json",
    themeColor: "#2563eb",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "GBP Rank Tracker",
    },
    viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0",
};

import { ClientLayout } from "@/components/layout/ClientLayout";

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${inter.variable} font-sans antialiased text-gray-900 bg-gray-50`}>
                <ClientLayout>
                    {children}
                </ClientLayout>
            </body>
        </html>
    );
}
