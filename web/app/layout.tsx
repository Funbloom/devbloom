import "./globals.css";

import { AppHeader } from "./components/AppHeader";

export const metadata = {
  title: "FunBloom Assist",
  description: "FunBloom Assist – Agents, Admin, Storyboard",
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
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
