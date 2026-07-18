export default function UnsubscribedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full text-center px-6 py-12">
        <span className="material-icons text-5xl text-muted-foreground mb-4 block">unsubscribe</span>
        <h1 className="text-2xl font-bold text-foreground mb-2">You&apos;ve been unsubscribed</h1>
        <p className="text-muted-foreground">
          You&apos;ve been removed from our mailing list and won&apos;t receive any more emails.
        </p>
      </div>
    </div>
  );
}
