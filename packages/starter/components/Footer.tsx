export default function Footer({ siteName }: { siteName: string }) {
  return (
    <footer className="border-t py-8">
      <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} {siteName}. Powered by{' '}
        <a href="https://simplerdevelopment.com" className="hover:underline" target="_blank" rel="noopener noreferrer">
          SimplerDevelopment
        </a>
      </div>
    </footer>
  );
}
