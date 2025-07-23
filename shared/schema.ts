import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  oktaId: text("okta_id").notNull().unique(),
  username: text("username").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // super_admin, app_owner, regular_user
  allRoles: jsonb("all_roles").$type<string[]>().default([]), // All user roles for display
  groups: jsonb("groups").$type<string[]>().default([]),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  userId: integer("user_id").references(() => users.id).notNull(),
  oktaTokens: jsonb("okta_tokens").$type<{
    accessToken: string;
    idToken: string;
    refreshToken?: string;
    expiresAt: number;
  }>().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  message: text("message").notNull(),
  response: text("response"),
  messageType: text("message_type").notNull(), // user, assistant
  command: text("command"), // PAM command if applicable
  createdAt: timestamp("created_at").defaultNow(),
});

export const pamSessions = pgTable("pam_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionId: text("session_id").notNull(),
  resourceName: text("resource_name").notNull(),
  status: text("status").notNull(), // active, terminated
  startTime: timestamp("start_time").defaultNow(),
  endTime: timestamp("end_time"),
});

export const userGamification = pgTable("user_gamification", {
  id: serial("id").primaryKey(),
  oktaId: text("okta_id").notNull().unique(),
  totalPoints: integer("total_points").default(0).notNull(),
  dailyStreak: integer("daily_streak").default(0).notNull(),
  totalLicenseSeatsSaved: integer("total_license_seats_saved").default(0).notNull(),
  accessRequestsSubmitted: integer("access_requests_submitted").default(0).notNull(),
  accessRevocations: integer("access_revocations").default(0).notNull(),
  governanceReviewsCompleted: integer("governance_reviews_completed").default(0).notNull(),
  badgesEarned: jsonb("badges_earned").$type<string[]>().default([]),
  level: integer("level").default(1).notNull(),
  experiencePoints: integer("experience_points").default(0).notNull(),
  nextLevelProgress: integer("next_level_progress").default(0).notNull(),
  lastVisit: timestamp("last_visit"),
  fastpassVerified: boolean("fastpass_verified").default(false).notNull(),
  lastFastpassCheck: timestamp("last_fastpass_check"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  oktaId: text("okta_id").notNull(),
  activityType: text("activity_type").notNull(),
  pointsEarned: integer("points_earned").default(0).notNull(),
  licenseSeatsSaved: integer("license_seats_saved").default(0).notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertPamSessionSchema = createInsertSchema(pamSessions).omit({
  id: true,
  startTime: true,
});

export const insertUserGamificationSchema = createInsertSchema(userGamification).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type UserGamification = typeof userGamification.$inferSelect;
export type InsertUserGamification = z.infer<typeof insertUserGamificationSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type PamSession = typeof pamSessions.$inferSelect;
export type InsertPamSession = z.infer<typeof insertPamSessionSchema>;

export type UserRole = 'super_admin' | 'group_admin' | 'app_owner' | 'regular_user';

export interface OktaUser {
  id: string;
  profile: {
    login: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  groups?: string[];
}

export interface McpResponse {
  success: boolean;
  data?: any;
  error?: string;
  toolName?: string;
}
