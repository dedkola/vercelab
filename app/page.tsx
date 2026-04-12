import MetricsDashboard from "@/components/metrics-dashboard";

export default function Home() {
  return (
    <div className="metrics-page">
      <header className="metrics-header">
        <div>
          <p className="metrics-header__eyebrow">Ubuntu live metrics</p>
          <h1>Vercelab</h1>
        </div>
        <p className="metrics-header__summary">
          CPU, memory, network interfaces, and container load.
        </p>
      </header>

      <main className="metrics-main">
        <MetricsDashboard />
      </main>
    </div>
  );
}
