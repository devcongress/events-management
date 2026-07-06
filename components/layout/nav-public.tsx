'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function NavPublic() {
  const pathname = usePathname();
  const [quizAvailable, setQuizAvailable] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Check if there's an active quiz session
    const checkQuizAvailability = async () => {
      try {
        const response = await fetch('/api/quiz/active');
        if (response.ok) {
          const data = await response.json();
          setQuizAvailable(data.available);
        }
      } catch (error) {
        console.error('Failed to check quiz availability:', error);
      }
    };

    checkQuizAvailability();
    // Poll every 10 seconds to update availability
    const interval = setInterval(checkQuizAvailability, 10000);
    return () => clearInterval(interval);
  }, []);

  const baseNavLinks = [
    { href: '/', label: 'Home' },
    { href: '/archive', label: 'Archive' },
    { href: '/leaderboard', label: 'Leaderboard' },
  ];

  // Add Play link only if quiz is available
  const navLinks = quizAvailable
    ? [
        ...baseNavLinks.slice(0, 3),
        { href: '/play', label: 'Play', highlight: true },
        ...baseNavLinks.slice(3),
      ]
    : baseNavLinks;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-50 bg-dc-dark border-b-2 border-dc-yellow backdrop-blur-sm bg-opacity-95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center font-bold text-xl group" onClick={() => setMobileMenuOpen(false)}>
              <span className="text-white">DEV</span>
              <span className="text-dc-yellow">::</span>
              <span className="text-white">CON</span>
              <span className="text-dc-gray group-hover:text-dc-yellow transition-colors">[]</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const active = isActive(link.href);
                const isPlayLink = link.href === '/play';
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-4 py-2 text-sm font-bold transition-colors relative group uppercase tracking-wide ${
                      active
                        ? 'text-dc-yellow'
                        : isPlayLink
                        ? 'text-dc-yellow animate-pulse'
                        : 'text-dc-gray-light hover:text-dc-yellow'
                    }`}
                  >
                    {link.label}
                    {isPlayLink && (
                      <span className="ml-1 inline-block w-2 h-2 bg-dc-yellow rounded-full animate-pulse" />
                    )}
                    <span
                      className={`absolute bottom-0 left-0 h-0.5 bg-dc-yellow transition-all ${
                        active ? 'w-full' : 'w-0'
                      }`}
                    />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
                {mobileMenuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t-2 border-dc-dark-3 bg-dc-dark-1">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navLinks.map((link) => {
                const active = isActive(link.href);
                const isPlayLink = link.href === '/play';
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-3 text-base font-bold transition-colors uppercase tracking-wide ${
                      active
                        ? 'bg-dc-yellow/10 text-dc-yellow border-l-4 border-dc-yellow'
                        : isPlayLink
                        ? 'text-dc-yellow animate-pulse'
                        : 'text-dc-gray-light hover:bg-dc-dark-2 hover:text-dc-yellow'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {link.label}
                      {isPlayLink && (
                        <span className="inline-block w-2 h-2 bg-dc-yellow rounded-full animate-pulse" />
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
