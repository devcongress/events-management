import Link from 'next/link';
import { getAllEvents } from '@/lib/mock-db/events';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const events = await getAllEvents();

  // Find next upcoming or live event
  const upcomingEvent = events
    .filter(e => e.status === 'live' || e.status === 'upcoming')
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())[0];

  // Find CFP open event
  const cfpOpenEvent = events.find(e => e.status === 'cfp_open');

  // Get recent completed events
  const completedEvents = events
    .filter(e => e.status === 'completed')
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
    .slice(0, 3);

  return (
    <div className="h-full bg-dc-dark overflow-hidden">
      {/* Full viewport landing page */}
      <div className="relative h-full flex items-center justify-center">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-dc-dark-1 via-dc-dark to-dc-dark opacity-50" />
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(249, 225, 94, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(249, 225, 94, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }} />

        <div className="relative w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-6 sm:space-y-8">
            {/* Next event badge */}
            {upcomingEvent && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-dc-dark-2 border border-dc-yellow/30 rounded font-mono text-xs sm:text-sm text-dc-yellow shadow-glow-sm">
                <span className="inline-block w-1.5 h-1.5 bg-dc-yellow rounded-full animate-pulse" />
                <span className="text-dc-gray">Next:</span>
                <span className="font-bold">{formatDate(upcomingEvent.event_date)}</span>
              </div>
            )}

            {/* Main heading - responsive sizing */}
            <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black font-mono tracking-tight leading-none">
              <span className="text-white">DEV</span>
              <span className="text-dc-yellow">::</span>
              <span className="text-white">CON</span>
              <span className="text-dc-gray">[]</span>
            </h1>

            {/* Tagline - responsive sizing */}
            <p className="text-base sm:text-xl md:text-2xl text-dc-gray-light font-mono max-w-2xl mx-auto sm:whitespace-nowrap">
              Community tech talks • Learn from experts • Share knowledge
            </p>

            {/* CTA - responsive sizing */}
            <div className="pt-2 sm:pt-4">
              <Link
                href="/archive"
                className="inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-10 py-3 sm:py-5 bg-dc-yellow text-dc-dark font-bold font-mono text-sm sm:text-lg uppercase tracking-wider hover:shadow-glow transition-all"
              >
                <span className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 bg-dc-dark animate-pulse" />
                View Talks
              </Link>
            </div>

            {/* Stats - responsive sizing */}
            <div className="flex items-center justify-center gap-6 sm:gap-8 pt-8 sm:pt-12">
              <div className="text-center">
                <div className="font-bold text-3xl sm:text-5xl md:text-6xl text-dc-yellow mb-1 sm:mb-2 font-mono">
                  {events.filter(e => e.status === 'completed').length}
                </div>
                <div className="font-mono text-dc-gray text-xs sm:text-sm uppercase tracking-wider">
                  Events
                </div>
              </div>

              <div className="h-12 sm:h-16 w-px bg-dc-yellow/20" />

              <div className="text-center">
                <div className="font-bold text-3xl sm:text-5xl md:text-6xl text-dc-yellow mb-1 sm:mb-2 font-mono">
                  {events.filter(e => e.status === 'completed').length * 2}
                </div>
                <div className="font-mono text-dc-gray text-xs sm:text-sm uppercase tracking-wider">
                  Talks
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Inline footer */}
        <div className="absolute bottom-0 inset-x-0 border-t border-dc-yellow/20 bg-dc-dark-1/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
            <p className="text-center text-dc-gray font-mono text-xs sm:text-sm">
              <span className="text-dc-yellow">©</span> DevCon-Comm - Community Presentations & Technical Learning
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
