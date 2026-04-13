import { Toaster } from "react-hot-toast";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col md:pl-60">
        <main className="flex-1">{children}</main>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "rgba(18,18,26,0.96)",
            backdropFilter: "blur(14px)",
            color: "#e0e0e0",
            border: "1px solid rgba(0,255,65,0.25)",
            borderRadius: "10px",
            fontSize: "12px",
            fontFamily: '"JetBrains Mono", monospace',
            boxShadow: "0 0 20px rgba(0,255,65,0.08)",
          },
          success: {
            iconTheme: { primary: "#00ff41", secondary: "rgba(18,18,26,0.96)" },
          },
          error: {
            iconTheme: { primary: "#ff003c", secondary: "rgba(18,18,26,0.96)" },
          },
        }}
      />
    </div>
  );
}
