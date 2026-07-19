import { get, post, patch, put, del } from './client';
import type { User, AuthResponse, Sighting, Paginated, Species, SettingItem, StatsSummary, SightingStatus, IdentificationCandidate } from '../types';

export const authApi = {
  me: () => get<AuthResponse>('/api/auth/me'),
  login: (username: string, password: string) => post<AuthResponse>('/api/auth/login', { username, password }),
  logout: () => post<{ ok: true }>('/api/auth/logout'),
  register: (username: string, password: string, displayName?: string) =>
    post<AuthResponse>('/api/auth/register', { username, password, displayName }),
  changePassword: (oldPassword: string, newPassword: string) =>
    post<{ ok: true }>('/api/auth/change-password', { oldPassword, newPassword }),
  checkUsername: (username: string) =>
    post<{ available: boolean }>('/api/auth/check-username', { username }),
};

export const usersApi = {
  list: () => get<User[]>('/api/users'),
  create: (data: { username: string; password: string; displayName?: string; role: 'admin' | 'member' }) =>
    post<{ id: number }>('/api/users', data),
  update: (id: number, data: Partial<Pick<User, 'displayName' | 'role'>> & { isActive?: boolean }) =>
    patch<{ ok: true }>(`/api/users/${id}`, data),
  remove: (id: number) => del<{ ok: true }>(`/api/users/${id}`),
  resetPassword: (id: number, newPassword: string) =>
    post<{ ok: true }>(`/api/users/${id}/reset-password`, { newPassword }),
};

export interface SightingsQuery {
  page?: number;
  speciesId?: number;
  status?: SightingStatus;
  favorite?: boolean;
  from?: string;
  to?: string;
  view?: 'all' | 'pending_only' | 'identified';
}

export const sightingsApi = {
  list: (q: SightingsQuery = {}) => get<Paginated<Sighting>>('/api/sightings', q),
  get: (id: number) => get<Sighting & { exif: any; species: Species | null; originalUrl: string }>(`/api/sightings/${id}`),
  update: (id: number, data: { speciesId?: number | null; userNote?: string; isFavorite?: boolean; takenAt?: string }) =>
    patch<{ ok: true }>(`/api/sightings/${id}`, data),
  remove: (id: number) => del<{ ok: true }>(`/api/sightings/${id}`),
  reidentify: (id: number) => post<{ ok: true; status: SightingStatus }>(`/api/sightings/${id}/reidentify`),
  confirm: (id: number, speciesId: number) =>
    post<{ ok: true }>(`/api/sightings/${id}/confirm`, { speciesId }),
  counts: () => get<Record<SightingStatus, number>>('/api/sightings/stats/counts'),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    return post<{ id: number; status: SightingStatus; thumbUrl: string; mainUrl: string }>('/api/sightings', fd);
  },
};

export const speciesApi = {
  list: (q: { page?: number; q?: string; family?: string; order?: string } = {}) =>
    get<Paginated<Species>>('/api/species', q),
  get: (id: number) => get<Species>(`/api/species/${id}`),
  create: (data: Partial<Species> & { scientificName: string }) =>
    post<{ id: number }>('/api/species', data),
  update: (id: number, data: Partial<Species>) =>
    patch<{ ok: true }>(`/api/species/${id}`, data),
  families: () => get<Array<{ familyName: string | null; orderName: string | null; count: number }>>('/api/species/stats/families'),
};

export const settingsApi = {
  list: () => get<SettingItem[]>('/api/settings'),
  update: (key: string, value: string) => put<{ ok: true }>(`/api/settings/${key}`, { value }),
};

export const statsApi = {
  summary: () => get<StatsSummary>('/api/stats/summary'),
  timeline: (year?: number) => get<Array<{ month: string; count: number }>>('/api/stats/timeline', { year }),
  familyDistribution: () => get<Array<{ familyName: string; orderName: string; count: number }>>('/api/stats/family-distribution'),
  topSpecies: () => get<Array<{ speciesId: number; scientificName: string; chineseName: string | null; englishName: string | null; familyName: string | null; count: number }>>('/api/stats/top-species'),
};