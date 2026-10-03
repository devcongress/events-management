'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Event, EventStatus } from '@/types';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

export default function EventDetailPage({ params }: { params: { eventId: string } }) {
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvent();
  }, [params.eventId]);

  const fetchEvent = async () => {
    const response = await fetch(`/api/events/${params.eventId}`);
    if (response.ok) {
      const data = await response.json();
      setEvent(data);
    }
    setLoading(false);
  };

  const updateStatus = async (status: EventStatus) => {
    const response = await fetch(`/api/events/${params.eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (response.ok) {
      fetchEvent();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-white font-mono">LOADING...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-dc-gray font-mono">EVENT NOT FOUND</p>
      </div>
    );
  }

  const statusFlow: EventStatus[] = ['draft', 'cfp_open', 'cfp_closed', 'upcoming', 'live', 'completed'];
  const currentIndex = statusFlow.indexOf(event.status);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-2 text-dc-yellow hover:text-dc-yellow-glow font-mono transition-colors"
        >
          <span>←</span> BACK TO EVENTS
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-white mb-2 font-mono">{event.name}</h1>
      <p className="text-dc-gray-light font-mono mb-6">
        <span className="text-dc-yellow">@</span> {formatDate(event.event_date)}
      </p>

      {event.description && (
        <p className="text-white/80 mb-8">{event.description}</p>
      )}

      <div className="bg-dc-dark-1 border-2 border-dc-dark-3 p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 border-l-2 border-b-2 border-dc-yellow/20" />

        <h2 className="text-xl font-bold text-white mb-4 font-mono flex items-center gap-3">
          <span className="text-dc-yellow">$</span> EVENT_STATUS
        </h2>

        <div className="flex flex-wrap gap-2 mb-4">
          {statusFlow.map((status, index) => {
            const isCurrent = event.status === status;
            const isPast = index < currentIndex;
            const isFuture = index > currentIndex;

            return (
              <button
                key={status}
                onClick={() => updateStatus(status)}
                disabled={isPast}
                className={`px-4 py-2 text-sm font-bold font-mono uppercase transition-all ${
                  isCurrent
                    ? 'bg-dc-yellow text-dc-dark shadow-glow'
                    : isPast
                    ? 'bg-dc-dark-2 text-dc-gray border border-dc-dark-3 cursor-not-allowed opacity-50'
                    : 'bg-dc-dark-2 text-white border-2 border-dc-dark-3 hover:border-dc-yellow/50'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-dc-gray font-mono">
          CURRENT: <span className="text-dc-yellow font-bold uppercase">{event.status.replace('_', ' ')}</span>
        </p>
      </div>

      <h2 className="text-xl font-bold text-white mb-4 font-mono flex items-center gap-3">
        <span className="text-dc-yellow">></span> QUICK_ACTIONS
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link
          href={`/admin/events/${event.id}/talks`}
          className="block bg-dc-dark-1 border-2 border-dc-dark-3 p-6 hover:border-dc-yellow/50 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-12 h-12 border-l-2 border-b-2 border-dc-yellow/10 group-hover:border-dc-yellow/30 transition-colors" />
          <h3 className="text-lg font-bold text-white mb-2 font-mono group-hover:text-dc-yellow transition-colors">
            MANAGE TALKS
          </h3>
          <p className="text-dc-gray-light text-sm">Review CFP submissions and manage talks</p>
        </Link>

        <Link
          href={`/admin/events/${event.id}/speakers`}
          className="block bg-dc-dark-1 border-2 border-dc-dark-3 p-6 hover:border-dc-yellow/50 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-12 h-12 border-l-2 border-b-2 border-dc-yellow/10 group-hover:border-dc-yellow/30 transition-colors" />
          <h3 className="text-lg font-bold text-white mb-2 font-mono group-hover:text-dc-yellow transition-colors">
            MANAGE SPEAKERS
          </h3>
          <p className="text-dc-gray-light text-sm">Manage approved speaker list for CFP</p>
        </Link>

      </div>
    </div>
  );
}
