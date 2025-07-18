// src/lib/db/schema.ts
import { 
  pgTable, 
  text, 
  timestamp, 
  jsonb, 
  integer,
  pgEnum,
  uuid,
  index
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Enums
export const sessionStatusEnum = pgEnum('session_status', ['active', 'inactive', 'paused', 'completed'])
export const participantStatusEnum = pgEnum('participant_status', ['idle', 'active', 'thinking', 'error'])
export const experimentStatusEnum = pgEnum('experiment_status', ['pending', 'running', 'paused', 'completed', 'failed', 'stopped'])
export const experimentRunStatusEnum = pgEnum('experiment_run_status', ['running', 'paused', 'completed', 'failed', 'stopped'])

// Sessions table
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: sessionStatusEnum('status').notNull().default('active'),
  metadata: jsonb('metadata').notNull().default({}),
  moderatorSettings: jsonb('moderator_settings').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  statusIdx: index('sessions_status_idx').on(table.status),
  updatedAtIdx: index('sessions_updated_at_idx').on(table.updatedAt)
}))

// Participants table
export const participants = pgTable('participants', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  status: participantStatusEnum('status').notNull().default('active'),
  messageCount: integer('message_count').notNull().default(0),
  settings: jsonb('settings').notNull().default({}),
  characteristics: jsonb('characteristics').notNull().default({}),
  systemPrompt: text('system_prompt').notNull().default(''),
  avatar: text('avatar'),
  color: text('color'),
  lastActive: timestamp('last_active').defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  sessionIdx: index('participants_session_id_idx').on(table.sessionId)
}))

// Messages table
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  participantId: text('participant_id').notNull(),
  participantName: text('participant_name').notNull(),
  participantType: text('participant_type').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  timestamp: timestamp('timestamp').notNull().defaultNow()
}, (table) => ({
  sessionIdx: index('messages_session_id_idx').on(table.sessionId),
  timestampIdx: index('messages_timestamp_idx').on(table.timestamp)
}))

export const analysisSnapshots = pgTable('analysis_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  messageCountAtAnalysis: integer('message_count_at_analysis').notNull(),
  participantCountAtAnalysis: integer('participant_count_at_analysis').notNull(),
  provider: text('provider').notNull(),
  conversationPhase: text('conversation_phase').notNull(),
  analysis: jsonb('analysis').notNull(),
  conversationContext: jsonb('conversation_context').notNull(),
  analysisType: text('analysis_type').default('full'),
  timestamp: timestamp('timestamp').notNull().defaultNow()
}, (table) => ({
  sessionIdx: index('analysis_snapshots_session_id_idx').on(table.sessionId),
  timestampIdx: index('analysis_snapshots_timestamp_idx').on(table.timestamp),
  providerIdx: index('analysis_snapshots_provider_idx').on(table.provider)
}))

// Experiments table
export const experiments = pgTable('experiments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  config: jsonb('config').notNull(),
  status: experimentStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  statusIdx: index('experiments_status_idx').on(table.status)
}))

// Experiment runs table
export const experimentRuns = pgTable('experiment_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  experimentId: uuid('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  status: experimentRunStatusEnum('status').notNull(),
  progress: integer('progress').notNull().default(0),
  totalSessions: integer('total_sessions').notNull(),
  completedSessions: integer('completed_sessions').notNull().default(0),
  failedSessions: integer('failed_sessions').notNull().default(0),
  averageMessageCount: integer('average_message_count').notNull().default(0),
  results: jsonb('results').notNull().default({}),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at')
}, (table) => ({
  experimentIdx: index('experiment_runs_experiment_id_idx').on(table.experimentId),
  statusIdx: index('experiment_runs_status_idx').on(table.status)
}))

// API errors table
export const apiErrors = pgTable('api_errors', {
  id: uuid('id').defaultRandom().primaryKey(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  provider: text('provider').notNull(),
  operation: text('operation').notNull(),
  attempt: integer('attempt').notNull(),
  maxAttempts: integer('max_attempts').notNull(),
  error: text('error').notNull(),
  sessionId: text('session_id'),
  participantId: text('participant_id')
}, (table) => ({
  timestampIdx: index('api_errors_timestamp_idx').on(table.timestamp),
  sessionIdx: index('api_errors_session_id_idx').on(table.sessionId),
  providerIdx: index('api_errors_provider_idx').on(table.provider)
}))

// Relations
export const sessionsRelations = relations(sessions, ({ many }) => ({
  participants: many(participants),
  messages: many(messages),
  analysisSnapshots: many(analysisSnapshots)
}))

export const participantsRelations = relations(participants, ({ one }) => ({
  session: one(sessions, {
    fields: [participants.sessionId],
    references: [sessions.id]
  })
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id]
  })
}))

export const analysisSnapshotsRelations = relations(analysisSnapshots, ({ one }) => ({
  session: one(sessions, {
    fields: [analysisSnapshots.sessionId],
    references: [sessions.id]
  })
}))

export const experimentsRelations = relations(experiments, ({ many }) => ({
  runs: many(experimentRuns)
}))

export const experimentRunsRelations = relations(experimentRuns, ({ one }) => ({
  experiment: one(experiments, {
    fields: [experimentRuns.experimentId],
    references: [experiments.id]
  })
}))