import { sqliteTable, integer, text, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id:                 integer('id').primaryKey({ autoIncrement: true }),
  username:           text('username').notNull().unique(),
  passwordHash:       text('password_hash').notNull(),
  displayName:        text('display_name'),
  avatarPath:         text('avatar_path'),
  role:               text('role', { enum: ['admin', 'member'] }).notNull(),
  isActive:           integer('is_active').notNull().default(1),
  mustChangePassword: integer('must_change_password').notNull().default(0),
  settingsJson:       text('settings_json').notNull().default('{}'),
  createdAt:          text('created_at').notNull().default(sql`(datetime('now'))`),
  lastLoginAt:        text('last_login_at'),
});

export const species = sqliteTable('species', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  scientificName:  text('scientific_name').notNull().unique(),
  chineseName:     text('chinese_name'),
  englishName:     text('english_name'),
  orderName:       text('order_name'),
  familyName:      text('family_name'),
  genus:           text('genus'),
  conservation:    text('conservation'),
  description:     text('description'),
  habitat:         text('habitat'),
  diet:            text('diet'),
  distribution:    text('distribution'),
  bodyLengthCm:    real('body_length_cm'),
  extraJson:       text('extra_json').notNull().default('{}'),
  createdVia:      text('created_via').notNull().default('ai'),
  createdAt:       text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt:       text('updated_at'),
  coverPhotoPath:   text('cover_photo_path'),
});

export const speciesAliases = sqliteTable('species_aliases', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  speciesId:  integer('species_id').notNull().references(() => species.id, { onDelete: 'cascade' }),
  aliasName:  text('alias_name').notNull(),
  language:   text('language').notNull().default('zh'),
}, (t) => ({
  uniqAlias: uniqueIndex('uniq_alias').on(t.aliasName, t.language),
}));

export const sightings = sqliteTable('sightings', {
  id:                 integer('id').primaryKey({ autoIncrement: true }),
  userId:             integer('user_id').notNull().references(() => users.id),
  speciesId:          integer('species_id').references(() => species.id),

  pathOriginal:       text('path_original').notNull(),
  pathMain:           text('path_main').notNull(),
  pathAi:             text('path_ai').notNull(),
  pathThumb:          text('path_thumb').notNull(),
  photoHash:          text('photo_hash').notNull(),
  fileSizeBytes:      integer('file_size_bytes'),

  takenAt:            text('taken_at'),
  uploadedAt:         text('uploaded_at').notNull().default(sql`(datetime('now'))`),

  lat:                real('lat'),
  lng:                real('lng'),
  locationName:       text('location_name'),
  altitudeM:          real('altitude_m'),
  locationSource:     text('location_source'),

  exifJson:           text('exif_json'),

  aiProvider:         text('ai_provider').notNull().default('minimax'),
  aiRequestId:        text('ai_request_id'),
  aiModel:            text('ai_model'),
  identificationJson: text('identification_json'),
  confidenceMax:      real('confidence_max'),
  status:             text('status', {
                       enum: ['pending', 'confirmed', 'corrected', 'failed']
                     }).notNull().default('pending'),
  correctionType:     text('correction_type'),

  userNote:           text('user_note'),
  isFavorite:         integer('is_favorite').notNull().default(0),
  deletedAt:          text('deleted_at'),
}, (t) => ({
  takenIdx:   index('idx_taken').on(t.takenAt),
  speciesIdx: index('idx_species').on(t.speciesId),
  statusIdx:  index('idx_status').on(t.status, t.takenAt),
  hashIdx:    index('idx_hash').on(t.photoHash),
}));

export const identificationCorrections = sqliteTable('identification_corrections', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  sightingId:     integer('sighting_id').notNull().references(() => sightings.id, { onDelete: 'cascade' }),
  userId:         integer('user_id').notNull().references(() => users.id),
  predictedTop:   text('predicted_top'),
  correctedTo:    integer('corrected_to').references(() => species.id),
  confidence:     real('confidence'),
  correctionType: text('correction_type'),
  comment:        text('comment'),
  createdAt:      text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const taskQueue = sqliteTable('task_queue', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  sightingId:  integer('sighting_id').notNull().references(() => sightings.id, { onDelete: 'cascade' }),
  taskType:    text('task_type').notNull(),
  status:      text('status', {
                enum: ['queued', 'running', 'done', 'failed']
              }).notNull().default('queued'),
  attempts:    integer('attempts').notNull().default(0),
  lastError:   text('last_error'),
  scheduledAt: text('scheduled_at').notNull().default(sql`(datetime('now'))`),
  startedAt:   text('started_at'),
  finishedAt:  text('finished_at'),
}, (t) => ({
  pickupIdx: index('idx_pickup').on(t.status, t.scheduledAt),
}));

export const settings = sqliteTable('settings', {
  key:        text('key').primaryKey(),
  value:      text('value'),
  isSecret:   integer('is_secret').notNull().default(0),
  updatedBy:  integer('updated_by').references(() => users.id),
  updatedAt:  text('updated_at'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Species = typeof species.$inferSelect;
export type NewSpecies = typeof species.$inferInsert;
export type Sighting = typeof sightings.$inferSelect;
export type NewSighting = typeof sightings.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type TaskQueue = typeof taskQueue.$inferSelect;