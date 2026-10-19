import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SchoolOS", template: "%s · SchoolOS" },
  description: "Run your school: learners, parents, textbooks, meetings and more.",
  applicationName: "SchoolOS",
};

export const viewport: Viewport = {
  themeColor: "#1d5fd1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full">
        <body className="min-h-full">
          {children}
          <ServiceWorker />
        </body>
      </html>
    </ClerkProvider>
  );
}
