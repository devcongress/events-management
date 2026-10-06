import Link from 'next/link';

export function NavAdmin() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-brand-dark min-h-screen border-r-2 border-brand-yellow">
          <div className="flex items-center justify-center h-16 bg-brand-dark-light border-b-2 border-brand-yellow">
            <Link href="/admin" className="text-brand-yellow text-xl font-bold">
              DevCon-Comm Admin
            </Link>
          </div>
          <nav className="mt-8">
            <Link
              href="/admin"
              className="flex items-center px-6 py-3 text-gray-300 hover:bg-brand-dark-light hover:text-brand-yellow"
            >
              <span>Dashboard</span>
            </Link>
            <Link
              href="/admin/events"
              className="flex items-center px-6 py-3 text-gray-300 hover:bg-brand-dark-light hover:text-brand-yellow"
            >
              <span>Events</span>
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
