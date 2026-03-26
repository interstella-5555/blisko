import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-[#1a1a1a]">Analiza matchow</h1>
      <p className="mt-2 text-sm text-[#6b6560]">Ladowanie danych...</p>
    </div>
  );
}
