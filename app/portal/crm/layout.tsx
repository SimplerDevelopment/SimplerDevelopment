export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto">
      {children}
    </div>
  );
}
