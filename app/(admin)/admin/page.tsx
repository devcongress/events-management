import Link from 'next/link';

export default function AdminDashboard() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-white mb-2 flex items-center gap-3">
          <span className="text-dc-yellow">$</span> Admin Dashboard
        </h1>
        <p className="text-dc-gray-light">Manage your events and talks</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Events Card */}
        <div className="bg-gradient-to-br from-dc-dark-1 to-dc-dark-2 border-2 border-dc-yellow/30 p-8 relative overflow-hidden group hover:border-dc-yellow hover:shadow-[0_0_30px_rgba(255,214,10,0.15)] transition-all duration-300">
          {/* Decorative corner */}
          <div className="absolute top-0 right-0 w-20 h-20 border-l-2 border-b-2 border-dc-yellow/30 group-hover:border-dc-yellow transition-colors" />

          {/* Icon */}
          <div className="mb-4">
            <div className="w-12 h-12 rounded-lg bg-dc-yellow/10 border border-dc-yellow/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-dc-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <h3 className="font-bold text-dc-gray text-xs mb-2 uppercase tracking-widest">Events</h3>
          <div className="flex items-end gap-3">
            <p className="text-6xl font-black text-dc-yellow leading-none">3</p>
            <span className="text-green-400 text-sm font-semibold mb-2">+1 this month</span>
          </div>
          <p className="text-sm text-dc-gray-light mt-3">Total events organized</p>
        </div>

        {/* Talks Card */}
        <div className="bg-gradient-to-br from-dc-dark-1 to-dc-dark-2 border-2 border-green-500/30 p-8 relative overflow-hidden group hover:border-green-400 hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] transition-all duration-300">
          {/* Decorative corner */}
          <div className="absolute top-0 right-0 w-20 h-20 border-l-2 border-b-2 border-green-500/30 group-hover:border-green-400 transition-colors" />

          {/* Icon */}
          <div className="mb-4">
            <div className="w-12 h-12 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </div>
          </div>

          <h3 className="font-bold text-dc-gray text-xs mb-2 uppercase tracking-widest">Talks</h3>
          <div className="flex items-end gap-3">
            <p className="text-6xl font-black text-green-400 leading-none">6</p>
            <span className="text-dc-yellow text-sm font-semibold mb-2">2 avg/event</span>
          </div>
          <p className="text-sm text-dc-gray-light mt-3">Total talk submissions</p>
        </div>

      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <span className="text-dc-yellow">&gt;</span> Quick Actions
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Primary Action */}
          <Link
            href="/admin/events/new"
            className="group relative bg-dc-yellow text-dc-dark px-8 py-6 font-bold text-center hover:shadow-[0_0_40px_rgba(255,214,10,0.3)] transition-all duration-300 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <div className="relative flex items-center justify-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="uppercase tracking-wide text-lg">Create New Event</span>
            </div>
          </Link>

          {/* Secondary Action */}
          <Link
            href="/admin/events"
            className="group relative bg-dc-dark-1 border-2 border-dc-yellow text-dc-yellow px-8 py-6 font-bold text-center hover:bg-dc-yellow hover:text-dc-dark hover:shadow-[0_0_30px_rgba(255,214,10,0.2)] transition-all duration-300"
          >
            <div className="relative flex items-center justify-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="uppercase tracking-wide text-lg">Manage Events</span>
            </div>
          </Link>

          {/* Events shortcut */}
          <Link
            href="/admin/events"
            className="group relative bg-dc-dark-1 border-2 border-dc-dark-3 text-white px-8 py-6 font-bold text-center hover:border-dc-yellow/50 hover:bg-dc-dark-2 transition-all duration-300"
          >
            <div className="relative flex items-center justify-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="uppercase tracking-wide text-lg">Manage Events</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
