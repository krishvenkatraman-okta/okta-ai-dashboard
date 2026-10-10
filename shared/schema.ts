import { z } from "zod";

export interface User {
  id: number;
  oktaId: string;
  username: string;
  email: string;
  name: string;
  role: string;
  allRoles: string[] | null;
  groups: string[] | null;
  lastLogin: Date | null;
  createdAt: Date | null;
}

export const insertUserSchema = z.object({
  oktaId: z.string(),
  username: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  allRoles: z.array(z.string()).nullable().optional(),
  groups: z.array(z.string()).nullable().optional(),
  lastLogin: z.date().nullable().optional(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;

export interface Session {
  id: number;
  sessionId: string;
  userId: number;
  oktaTokens: {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
    expiresAt: number;
  };
  expiresAt: Date;
  createdAt: Date | null;
}

export const insertSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.number().int(),
  oktaTokens: z.object({
    accessToken: z.string(),
    idToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.number(),
  }),
  expiresAt: z.date(),
});
export type InsertSession = z.infer<typeof insertSessionSchema>;

export interface ChatMessage {
  id: number;
  userId: number;
  message: string;
  response: string | null;
  messageType: string;
  command: string | null;
  createdAt: Date | null;
}

export const insertChatMessageSchema = z.object({
  userId: z.number().int(),
  message: z.string(),
  response: z.string().nullable().optional(),
  messageType: z.string(),
  command: z.string().nullable().optional(),
});
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

export interface PamSession {
  id: number;
  userId: number;
  sessionId: string;
  resourceName: string;
  status: string;
  startTime: Date | null;
  endTime: Date | null;
}

export const insertPamSessionSchema = z.object({
  userId: z.number().int(),
  sessionId: z.string(),
  resourceName: z.string(),
  status: z.string(),
  endTime: z.date().nullable().optional(),
});
export type InsertPamSession = z.infer<typeof insertPamSessionSchema>;

export type UserRole =
  | "super_admin"
  | "group_admin"
  | "app_owner"
  | "regular_user";

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
