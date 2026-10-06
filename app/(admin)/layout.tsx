'use client';

import { ToastProvider } from '@/components/ui/toast';
import { useState } from 'react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-dc-dark">
        {/* Mobile header with hamburger */}
        <div className="lg:hidden sticky top-0 z-50 bg-dc-dark-2 border-b-2 border-dc-yellow h-16 flex items-center justify-between px-4">
          <a href="/admin" className="text-white text-xl font-black flex items-center gap-2">
            <span className="text-dc-yellow">$</span>
            <span>ADMIN</span>
          </a>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-dc-yellow hover:text-dc-yellow-glow p-2 transition-colors"
            aria-label="Toggle menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {sidebarOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        <div className="flex h-[calc(100vh-4rem)] lg:h-screen">
          {/* Backdrop overlay for mobile */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <div
            className={`
              w-64 bg-dc-dark-1 h-full border-r-2 border-dc-dark-3 z-50
              fixed lg:relative
              transition-transform duration-300 ease-in-out
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}
          >
            <div className="hidden lg:flex items-center justify-center h-20 bg-dc-dark-2 border-b-2 border-dc-yellow">
              <a href="/admin" className="text-white text-2xl font-black flex items-center gap-2">
                <span className="text-dc-yellow">$</span>
                <span>ADMIN</span>
              </a>
            </div>
            <nav className="mt-6 lg:mt-6">
              <a
                href="/admin"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center px-6 py-4 text-dc-gray-light hover:bg-dc-dark-2 hover:text-dc-yellow transition-colors font-semibold uppercase text-sm tracking-wide border-l-2 border-transparent hover:border-dc-yellow"
              >
                <span className="mr-3 text-dc-yellow">▸</span>
                Dashboard
              </a>
              <a
                href="/admin/events"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center px-6 py-4 text-dc-gray-light hover:bg-dc-dark-2 hover:text-dc-yellow transition-colors font-semibold uppercase text-sm tracking-wide border-l-2 border-transparent hover:border-dc-yellow"
              >
                <span className="mr-3 text-dc-yellow">▸</span>
                Events
              </a>
              <div className="mt-8 mx-6 pt-6 border-t-2 border-dc-dark-3">
                <a
                  href="/"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center px-0 py-3 text-dc-gray hover:text-white transition-colors text-xs uppercase tracking-wide"
                >
                  <span className="mr-2">←</span>
                  Back to Site
                </a>
              </div>
            </nav>
          </div>

          {/* Main content */}
          <div className="flex-1 h-full overflow-hidden">
            <main className="p-4 sm:p-6 lg:p-8 h-full overflow-hidden">{children}</main>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
