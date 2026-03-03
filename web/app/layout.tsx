import "./globals.css";

import { AppHeader } from "./components/AppHeader";
import { ThemeInitializer } from "./components/ThemeInitializer";

export const metadata = {
  title: "DevBloom Studio",
  description: "DevBloom Studio – Agents, Admin, Storyboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-layout">
          <ThemeInitializer />
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
