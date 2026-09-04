export default function Loading() {
  return <div className="route-loading" role="status" aria-label="Loading dashboard">
    <div className="skeleton short"/><div className="skeleton title"/><div className="skeleton copy"/>
    <div className="skeleton-grid">{[0, 1, 2, 3].map((item) => <div className="skeleton card" key={item}/>)}</div>
    <div className="skeleton chart-skeleton"/><span>Loading LeakGuard data...</span>
  </div>;
}
