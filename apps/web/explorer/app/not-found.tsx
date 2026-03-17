export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-white mb-4">404</h1>
        <p className="text-slate-400 mb-8">Page not found</p>
        <a href="/" className="btn-primary">
          Go Home
        </a>
      </div>
    </div>
  );
}