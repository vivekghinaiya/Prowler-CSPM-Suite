import { Toaster } from "react-hot-toast";
import Aurora from "./Aurora";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-page">
      <Aurora />
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col pl-60">
        <main className="flex-1">{children}</main>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "rgb(18 30 48)",
            color: "rgb(226 232 240)",
            border: "1px solid rgb(40 60 92)",
            borderRadius: "8px",
            fontSize: "14px",
          },
          success: {
            iconTheme: { primary: "#22c55e", secondary: "rgb(18 30 48)" },
          },
          error: {
            iconTheme: { primary: "#ef4444", secondary: "rgb(18 30 48)" },
          },
        }}
      />
    </div>
  );
}
