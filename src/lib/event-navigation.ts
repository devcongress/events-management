export function eventNavigationTabs(quarterly: boolean, systemDesignAvailable: boolean) {
  const tabs = [
    { href: '', label: 'Overview' },
    { href: 'registrations', label: 'Registration' },
  ];

  if (!quarterly) {
    tabs.push({ href: 'talks', label: 'Talks' });
    if (systemDesignAvailable) tabs.push({ href: 'system-design', label: 'System Design' });
  }
  tabs.push({ href: 'feedback', label: 'Feedback' });
  if (!quarterly) tabs.push({ href: 'attendance', label: 'Attendance' });

  return tabs;
}
