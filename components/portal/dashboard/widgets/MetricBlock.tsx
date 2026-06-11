export default function MetricBlock({
  icon,
  color,
  value,
  label,
}: {
  icon: string;
  color: string;
  value: string | number;
  label: string;
}) {
  return (
    <div>
      <span className={`material-icons text-2xl ${color}`}>{icon}</span>
      <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
