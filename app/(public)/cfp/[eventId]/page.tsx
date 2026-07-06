'use client';

import { useEffect, useState } from 'react';
import { Event } from '@/types';
import { formatDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';

export default function CFPPage({ params }: { params: { eventId: string } }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailValidated, setEmailValidated] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);

  const [formData, setFormData] = useState({
    speaker_name: '',
    speaker_email: '',
    github_username: '',
    title: '',
    abstract: '',
    bio: '',
  });

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

  const validateEmail = async (email: string) => {
    if (!email) {
      setEmailValidated(false);
      return;
    }

    setEmailChecking(true);
    try {
      const response = await fetch(`/api/events/${params.eventId}/validate-speaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        const data = await response.json();
        setEmailValidated(data.valid);
        if (!data.valid) {
          showToast(
            'This email is not on the approved speakers list. Contact the organizers.',
            'error'
          );
        }
      }
    } catch (error) {
      console.error('Error validating email:', error);
    } finally {
      setEmailChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email before submission
    if (!emailValidated) {
      await validateEmail(formData.speaker_email);
      if (!emailValidated) {
        return;
      }
    }

    setSubmitting(true);

    const response = await fetch('/api/cfp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: params.eventId,
        ...formData,
        github_username: formData.github_username || null,
      }),
    });

    if (response.ok) {
      setSubmitted(true);
    } else {
      const error = await response.json();
      showToast(error.error || 'Failed to submit CFP', 'error');
    }

    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dc-dark flex items-center justify-center">
        <p className="text-white font-mono">LOADING...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-dc-dark flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-white font-mono">EVENT NOT FOUND</p>
        </div>
      </div>
    );
  }

  if (event.status !== 'cfp_open') {
    return (
      <div className="min-h-screen bg-dc-dark flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-dc-dark-1 border-2 border-dc-yellow/30 p-6 sm:p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-white mb-2 font-mono">CFP CLOSED</h2>
          <p className="text-dc-gray-light font-mono mb-6">
            Call for Presentations is not currently open for this event
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-dc-yellow text-dc-dark font-bold font-mono hover:shadow-glow transition-shadow uppercase tracking-wide"
          >
            BACK TO HOME
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-dc-dark flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-dc-dark-1 border-2 border-dc-yellow p-6 sm:p-8 text-center shadow-glow">
          <div className="text-6xl mb-6">✓</div>
          <h2 className="text-3xl font-bold text-dc-yellow mb-4 font-mono">SUBMITTED!</h2>
          <p className="text-white font-mono mb-6">
            Your talk proposal has been received. We'll review it and notify you via email.
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full px-6 py-3 border-2 border-dc-yellow text-dc-yellow font-bold font-mono hover:shadow-glow-sm transition-all uppercase tracking-wide"
          >
            BACK TO HOME
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dc-dark">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-block px-3 py-1 bg-dc-yellow text-dc-dark font-mono text-xs font-bold mb-4 uppercase tracking-wide">
            Call for Presentations
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 font-mono">
            SUBMIT_TALK
          </h1>
          <p className="text-dc-yellow font-mono text-lg mb-1">{event.name}</p>
          <p className="text-dc-gray font-mono">{formatDate(event.event_date)}</p>
        </div>

        {/* Event Description */}
        {event.description && (
          <div className="bg-dc-dark-1 border-2 border-dc-yellow/30 p-6 mb-8">
            <p className="text-white/90">{event.description}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-dc-dark-1 border-2 border-dc-dark-3 p-6 sm:p-8 space-y-6">
          <div>
            <label htmlFor="speaker_name" className="block text-dc-yellow font-mono text-xs font-bold mb-2 uppercase">
              Your Name *
            </label>
            <input
              type="text"
              id="speaker_name"
              value={formData.speaker_name}
              onChange={(e) => setFormData({ ...formData, speaker_name: e.target.value })}
              required
              className="w-full bg-dc-dark-2 border-2 border-dc-dark-3 focus:border-dc-yellow text-white font-mono px-4 py-3 outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="speaker_email" className="block text-dc-yellow font-mono text-xs font-bold mb-2 uppercase">
              Email Address *
            </label>
            <input
              type="email"
              id="speaker_email"
              value={formData.speaker_email}
              onChange={(e) => {
                setFormData({ ...formData, speaker_email: e.target.value });
                setEmailValidated(false);
              }}
              onBlur={(e) => validateEmail(e.target.value)}
              required
              className={`w-full bg-dc-dark-2 border-2 ${
                emailValidated
                  ? 'border-green-500'
                  : emailChecking
                  ? 'border-dc-yellow'
                  : 'border-dc-dark-3'
              } focus:border-dc-yellow text-white font-mono px-4 py-3 outline-none transition-colors`}
            />
            {emailChecking && (
              <p className="text-dc-yellow text-xs font-mono mt-1">Validating email...</p>
            )}
            {emailValidated && (
              <p className="text-green-400 text-xs font-mono mt-1">✓ Email approved</p>
            )}
          </div>

          <div>
            <label htmlFor="github_username" className="block text-dc-yellow font-mono text-xs font-bold mb-2 uppercase">
              GitHub Username (optional)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-dc-gray font-mono">@</span>
              <input
                type="text"
                id="github_username"
                value={formData.github_username}
                onChange={(e) => setFormData({ ...formData, github_username: e.target.value })}
                placeholder="octocat"
                className="w-full bg-dc-dark-2 border-2 border-dc-dark-3 focus:border-dc-yellow text-white font-mono px-4 py-3 pl-8 outline-none transition-colors placeholder:text-dc-gray"
              />
            </div>
            <p className="text-dc-gray text-xs font-mono mt-1">
              Your profile picture will be displayed on your talk card
            </p>
          </div>

          <div>
            <label htmlFor="title" className="block text-dc-yellow font-mono text-xs font-bold mb-2 uppercase">
              Talk Title *
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="Building Scalable APIs with GraphQL"
              className="w-full bg-dc-dark-2 border-2 border-dc-dark-3 focus:border-dc-yellow text-white font-mono px-4 py-3 outline-none transition-colors placeholder:text-dc-gray"
            />
          </div>

          <div>
            <label htmlFor="abstract" className="block text-dc-yellow font-mono text-xs font-bold mb-2 uppercase">
              Abstract
            </label>
            <textarea
              id="abstract"
              value={formData.abstract}
              onChange={(e) => setFormData({ ...formData, abstract: e.target.value })}
              rows={5}
              placeholder="Brief description of your talk (what will you cover, who is it for?)"
              className="w-full bg-dc-dark-2 border-2 border-dc-dark-3 focus:border-dc-yellow text-white font-mono px-4 py-3 outline-none transition-colors placeholder:text-dc-gray resize-none"
            />
          </div>

          <div>
            <label htmlFor="bio" className="block text-dc-yellow font-mono text-xs font-bold mb-2 uppercase">
              Speaker Bio
            </label>
            <textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={3}
              placeholder="A few sentences about yourself"
              className="w-full bg-dc-dark-2 border-2 border-dc-dark-3 focus:border-dc-yellow text-white font-mono px-4 py-3 outline-none transition-colors placeholder:text-dc-gray resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-dc-yellow text-dc-dark px-6 py-4 font-bold font-mono text-lg hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide"
          >
            {submitting ? 'SUBMITTING...' : 'SUBMIT PROPOSAL'}
          </button>
        </form>
      </div>
    </div>
  );
}
