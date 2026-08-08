import { readData, updateData } from './index';
import { User } from '@/types';
import { generateId, now } from '@/lib/utils';

const FILE = 'users';

export async function getAllUsers(): Promise<User[]> {
  return readData<User>(FILE);
}

export async function getUserById(id: string): Promise<User | undefined> {
  const users = await readData<User>(FILE);
  return users.find(u => u.id === id);
}

export async function getUserByDeviceId(deviceId: string): Promise<User | undefined> {
  const users = await readData<User>(FILE);
  return users.find(u => u.device_id === deviceId);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const users = await readData<User>(FILE);
  return users.find(u => u.email === email);
}

export async function createUser(
  data: Partial<Omit<User, 'id' | 'created_at' | 'total_points' | 'events_participated' | 'is_claimed' | 'is_admin' | 'merged_into_user_id'>>
): Promise<User> {
  const newUser: User = {
    device_id: null,
    nickname: null,
    username: null,
    email: null,
    secret_question: null,
    secret_answer_hash: null,
    is_claimed: false,
    is_admin: false,
    merged_into_user_id: null,
    total_points: 0,
    events_participated: 0,
    ...data,
    id: generateId(),
    created_at: now(),
  };
  await updateData<User, void>(FILE, (users) => ({ data: [...users, newUser], result: undefined }));
  return newUser;
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<User, 'id' | 'created_at'>>
): Promise<User> {
  return updateData<User, User>(FILE, (users) => {
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error(`User ${id} not found`);
    const user = { ...users[index], ...updates };
    const next = [...users];
    next[index] = user;
    return { data: next, result: user };
  });
}

export async function deleteUser(id: string): Promise<void> {
  await updateData<User, void>(FILE, (users) => ({ data: users.filter(u => u.id !== id), result: undefined }));
}
