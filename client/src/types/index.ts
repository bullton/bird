export type UserRole = 'admin' | 'member';

export interface User {
  id: number;
  username: string;
  displayName?: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface AuthResponse {
  id: number;
  username?: string;
  displayName?: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export type SightingStatus = 'pending' | 'confirmed' | 'corrected' | 'failed';

export interface IdentificationCandidate {
  scientific_name: string;
  chinese_name?: string;
  english_name?: string;
  order_name?: string;
  family_name?: string;
  genus?: string;
  conservation?: string;
  body_length_cm?: number;
  confidence: number;
}

export interface Sighting {
  id: number;
  userId: number;
  speciesId: number | null;
  thumbUrl: string;
  mainUrl: string;
  takenAt: string | null;
  uploadedAt: string;
  status: SightingStatus;
  confidenceMax: number | null;
  identification: IdentificationCandidate[] | null;
  isFavorite: boolean;
  userNote: string | null;
  scientificName?: string | null;
  chineseName?: string | null;
  englishName?: string | null;
  familyName?: string | null;
  username?: string;
  displayName?: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Species {
  id: number;
  scientificName: string;
  chineseName: string | null;
  englishName: string | null;
  orderName: string | null;
  familyName: string | null;
  genus: string | null;
  conservation: string | null;
  bodyLengthCm: number | null;
  createdVia: string;
  sightingCount?: number;
  coverPhotoPath?: string | null;
  thumbUrl?: string | null;
  description?: string | null;
  habitat?: string | null;
  diet?: string | null;
  distribution?: string | null;
  stats?: { total: number; pending: number; confirmed: number; corrected: number; failed: number };
}

export interface SettingItem {
  key: string;
  isSecret: boolean;
  hasValue: boolean;
  masked: string;
  updatedAt?: string;
}

export interface StatsSummary {
  totalSightings: number;
  speciesCount: number;
  identified: number;
  pending: number;
  failed: number;
  userCount: number;
}