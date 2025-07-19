import { users, sessions, chatMessages, pamSessions, type User, type InsertUser, type Session, type InsertSession, type ChatMessage, type InsertChatMessage, type PamSession, type InsertPamSession } from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByOktaId(oktaId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;

  // Sessions
  createSession(session: InsertSession): Promise<Session>;
  getSession(sessionId: string): Promise<Session | undefined>;
  updateSession(sessionId: string, updates: Partial<Session>): Promise<Session | undefined>;
  deleteSession(sessionId: string): Promise<void>;

  // Chat Messages
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(userId: number, limit?: number): Promise<ChatMessage[]>;

  // PAM Sessions
  createPamSession(session: InsertPamSession): Promise<PamSession>;
  getPamSessions(userId: number): Promise<PamSession[]>;
  updatePamSession(id: number, updates: Partial<PamSession>): Promise<PamSession | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private sessions: Map<string, Session>;
  private chatMessages: Map<number, ChatMessage>;
  private pamSessions: Map<number, PamSession>;
  private currentUserId: number;
  private currentChatId: number;
  private currentPamId: number;

  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.chatMessages = new Map();
    this.pamSessions = new Map();
    this.currentUserId = 1;
    this.currentChatId = 1;
    this.currentPamId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByOktaId(oktaId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.oktaId === oktaId);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      createdAt: new Date(),
      lastLogin: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const session: Session = {
      ...insertSession,
      id: Date.now(),
      createdAt: new Date()
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.sessions.get(sessionId);
  }

  async updateSession(sessionId: string, updates: Partial<Session>): Promise<Session | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates };
    this.sessions.set(sessionId, updatedSession);
    return updatedSession;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = this.currentChatId++;
    const message: ChatMessage = {
      ...insertMessage,
      id,
      createdAt: new Date()
    };
    this.chatMessages.set(id, message);
    return message;
  }

  async getChatMessages(userId: number, limit = 50): Promise<ChatMessage[]> {
    const messages = Array.from(this.chatMessages.values())
      .filter(msg => msg.userId === userId)
      .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0))
      .slice(-limit);
    return messages;
  }

  async createPamSession(insertPamSession: InsertPamSession): Promise<PamSession> {
    const id = this.currentPamId++;
    const pamSession: PamSession = {
      ...insertPamSession,
      id,
      startTime: new Date()
    };
    this.pamSessions.set(id, pamSession);
    return pamSession;
  }

  async getPamSessions(userId: number): Promise<PamSession[]> {
    return Array.from(this.pamSessions.values())
      .filter(session => session.userId === userId);
  }

  async updatePamSession(id: number, updates: Partial<PamSession>): Promise<PamSession | undefined> {
    const session = this.pamSessions.get(id);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates };
    this.pamSessions.set(id, updatedSession);
    return updatedSession;
  }
}

export const storage = new MemStorage();
