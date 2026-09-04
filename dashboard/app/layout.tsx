import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = { title: "LeakGuard Control Plane", description: "Resource leak debt and witness paths" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="shell"><Nav/><main>{children}</main></div></body></html>;
}
