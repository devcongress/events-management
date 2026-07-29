import type { EventRegistration } from '@/types';

const SIMULATED_REGISTRATION_PREFIX = 'simulated-registration-';
const SIMULATED_GUEST_NAMES = [
  'Abena Owusu',
  'Adjoa Mensah',
  'Afia Boateng',
  'Akosua Addo',
  'Ama Serwaa',
  'Amina Sulemana',
  'Anita Ofori',
  'Audrey Dapaah',
  'Belinda Asare',
  'Bernard Tetteh',
  'Bright Nyarko',
  'Caleb Quartey',
  'Charles Antwi',
  'Comfort Agyeman',
  'Daniel Lartey',
  'David Osei',
  'Delali Tsegah',
  'Derrick Kusi',
  'Ebo Hammond',
  'Efua Ansah',
  'Emefa Adjei',
  'Emmanuel Baah',
  'Enyonam Agbemava',
  'Eric Danso',
  'Evelyn Arthur',
  'Felix Annan',
  'Francis Kwarteng',
  'Freda Nkrumah',
  'Gideon Amankwah',
  'Gladys Sackey',
  'Gloria Bediako',
  'Grace Ampofo',
  'Henry Frimpong',
  'Ibrahim Mahama',
  'Isaac Appiah',
  'Jacqueline Aidoo',
  'James Awuah',
  'Jennifer Lamptey',
  'Joel Mireku',
  'Joseph Tagoe',
  'Joshua Boadu',
  'Kafui Dzakpasu',
  'Kofi Amoako',
  'Kojo Poku',
  'Kwabena Gyasi',
  'Lydia Aboagye',
  'Mabel Nortey',
  'Mavis Koomson',
  'Naa Ashorkor',
  'Nana Yeboah',
  'Nathaniel Nartey',
  'Patricia Opoku',
  'Priscilla Aryee',
  'Prince Ababio',
  'Regina Lomotey',
  'Richard Amponsah',
  'Ruth Sarpong',
  'Samuel Darko',
  'Sena Akoto',
  'Serwaa Botchway',
  'Sheila Kyei',
  'Theophilus Ackah',
  'Yaa Konadu',
  'Zita Kumi',
] as const;

export function createSimulatedRegistrations(): EventRegistration[] {
  const baseTimestamp = Date.parse('2026-07-28T10:00:00.000Z');

  return SIMULATED_GUEST_NAMES.map((name, index) => {
    const status = index >= 56 ? 'waitlisted' : 'confirmed';
    const timestamp = new Date(baseTimestamp - index * 60_000).toISOString();

    return {
      id: `${SIMULATED_REGISTRATION_PREFIX}${index + 1}`,
      campaign_id: 'simulated-campaign',
      name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.test`,
      status,
      confirmed_at: status === 'confirmed' ? timestamp : null,
      cancelled_at: null,
      checked_in_at: status === 'confirmed' && index % 3 === 0
        ? '2026-07-28T10:30:00.000Z'
        : null,
      email_status: 'accepted',
      created_at: timestamp,
      updated_at: timestamp,
    };
  });
}

export function isSimulatedRegistration(registrationId: string): boolean {
  return registrationId.startsWith(SIMULATED_REGISTRATION_PREFIX);
}
