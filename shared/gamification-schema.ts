import { pgTable, text, serial, integer, timestamp, boolean, decimal } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// User points and achievements tracking
export const userGamification = pgTable('user_gamification', {
  id: serial('id').primaryKey(),
  oktaId: text('okta_id').notNull().unique(),
  totalPoints: integer('total_points').default(0),
  dailyStreak: integer('daily_streak').default(0),
  lastVisit: timestamp('last_visit'),
  totalCostSaved: decimal('total_cost_saved', { precision: 10, scale: 2 }).default('0.00'),
  accessRequestsSubmitted: integer('access_requests_submitted').default(0),
  accessRevocations: integer('access_revocations').default(0),
  governanceReviewsCompleted: integer('governance_reviews_completed').default(0),
  badgesEarned: text('badges_earned').array().default([]),
  level: integer('level').default(1),
  experiencePoints: integer('experience_points').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Activity logs for point tracking
export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  oktaId: text('okta_id').notNull(),
  activityType: text('activity_type').notNull(), // 'daily_visit', 'access_request', 'access_revocation', 'governance_review'
  pointsEarned: integer('points_earned').notNull(),
  costSaved: decimal('cost_saved', { precision: 10, scale: 2 }).default('0.00'),
  description: text('description').notNull(),
  metadata: text('metadata'), // JSON string for additional data
  createdAt: timestamp('created_at').defaultNow()
});

// Badge definitions
export const badges = pgTable('badges', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  icon: text('icon').notNull(),
  category: text('category').notNull(), // 'engagement', 'cost_saver', 'governance', 'streak'
  requirement: text('requirement').notNull(), // JSON string describing unlock criteria
  pointsReward: integer('points_reward').default(0),
  rarity: text('rarity').notNull().default('common'), // 'common', 'rare', 'epic', 'legendary'
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow()
});

// Leaderboards
export const leaderboards = pgTable('leaderboards', {
  id: serial('id').primaryKey(),
  oktaId: text('okta_id').notNull(),
  userName: text('user_name').notNull(),
  totalPoints: integer('total_points').notNull(),
  totalCostSaved: decimal('total_cost_saved', { precision: 10, scale: 2 }).notNull(),
  rank: integer('rank'),
  period: text('period').notNull(), // 'weekly', 'monthly', 'all_time'
  updatedAt: timestamp('updated_at').defaultNow()
});

// Schema exports
export const insertUserGamificationSchema = createInsertSchema(userGamification);
export const insertActivityLogSchema = createInsertSchema(activityLogs);
export const insertBadgeSchema = createInsertSchema(badges);
export const insertLeaderboardSchema = createInsertSchema(leaderboards);

export type UserGamification = typeof userGamification.$inferSelect;
export type InsertUserGamification = z.infer<typeof insertUserGamificationSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type Badge = typeof badges.$inferSelect;
export type InsertBadge = z.infer<typeof insertBadgeSchema>;

export type Leaderboard = typeof leaderboards.$inferSelect;
export type InsertLeaderboard = z.infer<typeof insertLeaderboardSchema>;

// Point system constants
export const POINTS_SYSTEM = {
  DAILY_VISIT: 10,
  FIRST_VISIT_BONUS: 25,
  ACCESS_REQUEST: 15,
  ACCESS_REVOCATION: 30,
  GOVERNANCE_REVIEW: 20,
  STREAK_BONUS_MULTIPLIER: 1.5, // 50% bonus for streaks > 7 days
  COST_SAVING_MULTIPLIER: 10 // 10 points per dollar saved
} as const;

// Cost savings estimates per application type
export const APP_COST_ESTIMATES = {
  'Adobe': { monthly: 52.99, annual: 599.88 },
  'Salesforce': { monthly: 150, annual: 1800 },
  'Microsoft Office 365': { monthly: 12.50, annual: 150 },
  'Okta': { monthly: 8, annual: 96 },
  'ServiceNow': { monthly: 100, annual: 1200 },
  'IBM': { monthly: 75, annual: 900 },
  'default': { monthly: 25, annual: 300 }
} as const;

// Badge definitions
export const BADGE_DEFINITIONS = [
  {
    name: 'Welcome Aboard',
    description: 'Complete your first dashboard visit',
    icon: '🎯',
    category: 'engagement',
    requirement: JSON.stringify({ type: 'daily_visit', count: 1 }),
    pointsReward: 50,
    rarity: 'common'
  },
  {
    name: 'Daily Warrior',
    description: 'Visit the dashboard 7 days in a row',
    icon: '🔥',
    category: 'streak',
    requirement: JSON.stringify({ type: 'daily_streak', count: 7 }),
    pointsReward: 100,
    rarity: 'rare'
  },
  {
    name: 'Cost Conscious',
    description: 'Save your first $100 for the company',
    icon: '💰',
    category: 'cost_saver',
    requirement: JSON.stringify({ type: 'cost_saved', amount: 100 }),
    pointsReward: 150,
    rarity: 'rare'
  },
  {
    name: 'License Liberator',
    description: 'Revoke access to 5 unused applications',
    icon: '🚫',
    category: 'cost_saver',
    requirement: JSON.stringify({ type: 'access_revocations', count: 5 }),
    pointsReward: 200,
    rarity: 'epic'
  },
  {
    name: 'Governance Guardian',
    description: 'Complete 10 governance reviews',
    icon: '🛡️',
    category: 'governance',
    requirement: JSON.stringify({ type: 'governance_reviews', count: 10 }),
    pointsReward: 300,
    rarity: 'epic'
  },
  {
    name: 'Super Saver',
    description: 'Save $1000+ for the company',
    icon: '🏆',
    category: 'cost_saver',
    requirement: JSON.stringify({ type: 'cost_saved', amount: 1000 }),
    pointsReward: 500,
    rarity: 'legendary'
  },
  {
    name: 'Dedicated User',
    description: 'Maintain a 30-day visit streak',
    icon: '⭐',
    category: 'streak',
    requirement: JSON.stringify({ type: 'daily_streak', count: 30 }),
    pointsReward: 1000,
    rarity: 'legendary'
  }
] as const;