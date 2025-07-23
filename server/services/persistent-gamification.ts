import { eq, desc, sql } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { userGamification, activityLogs, type UserGamification, type ActivityLog, type InsertUserGamification, type InsertActivityLog } from '../../shared/schema.js';

const sql_connection = neon(process.env.DATABASE_URL!);
const db = drizzle(sql_connection);

interface UserStats {
  totalPoints: number;
  dailyStreak: number;
  totalLicenseSeatsSaved: number;
  accessRequestsSubmitted: number;
  accessRevocations: number;
  governanceReviewsCompleted: number;
  badgesEarned: string[];
  level: number;
  experiencePoints: number;
  recentActivities: ActivityLog[];
  nextLevelProgress: number;
  lastVisit?: Date;
  fastpassVerified: boolean;
  lastFastpassCheck: Date | null;
}

interface LeaderboardEntry {
  oktaId: string;
  userName: string;
  totalPoints: number;
  totalLicenseSeatsSaved: number;
  rank: number;
}

interface GamificationResult {
  points: number;
  licenseSeatsSaved: number;
  badgesEarned: string[];
}

class PersistentGamificationService {
  private badges = new Set([
    'Welcome Aboard',
    'Daily Warrior',
    'Cost Conscious',
    'License Liberator',
    'Governance Guardian',
    'Super Saver',
    'Dedicated User',
    'Security Champion'
  ]);

  private async getOrCreateUserStats(oktaId: string): Promise<UserGamification> {
    try {
      // Try to find existing user stats
      const existing = await db.select().from(userGamification).where(eq(userGamification.oktaId, oktaId)).limit(1);
      
      if (existing.length > 0) {
        return existing[0];
      }

      // Create new user stats
      const newStats: InsertUserGamification = {
        oktaId,
        totalPoints: 0,
        dailyStreak: 0,
        totalLicenseSeatsSaved: 0,
        accessRequestsSubmitted: 0,
        accessRevocations: 0,
        governanceReviewsCompleted: 0,
        badgesEarned: [],
        level: 1,
        experiencePoints: 0,
        nextLevelProgress: 0,
        fastpassVerified: false,
        lastFastpassCheck: null
      };

      const result = await db.insert(userGamification).values(newStats).returning();
      return result[0];
    } catch (error) {
      console.error('❌ Error getting/creating user stats:', error);
      throw error;
    }
  }

  private calculateLevel(points: number): { level: number; progress: number } {
    const level = Math.floor(points / 100) + 1;
    const progress = ((points % 100) / 100) * 100;
    return { level, progress };
  }

  private async addActivity(oktaId: string, activityType: string, points: number, licenseSeatsSaved: number, description: string) {
    try {
      const activity: InsertActivityLog = {
        oktaId,
        activityType,
        pointsEarned: points,
        licenseSeatsSaved,
        description
      };
      
      await db.insert(activityLogs).values(activity);
    } catch (error) {
      console.error('❌ Error adding activity:', error);
    }
  }

  private async checkForNewBadges(oktaId: string, stats: UserGamification): Promise<string[]> {
    const newBadges: string[] = [];
    const currentBadges = Array.isArray(stats.badgesEarned) ? stats.badgesEarned : [];
    
    // Welcome badge
    if (!currentBadges.includes('Welcome Aboard') && stats.totalPoints >= 10) {
      newBadges.push('Welcome Aboard');
    }
    
    // Daily streak badge
    if (!currentBadges.includes('Daily Warrior') && stats.dailyStreak >= 7) {
      newBadges.push('Daily Warrior');
    }
    
    // License seats saved badge
    if (!currentBadges.includes('Cost Conscious') && stats.totalLicenseSeatsSaved >= 5) {
      newBadges.push('Cost Conscious');
    }
    
    // Access revocation badge
    if (!currentBadges.includes('License Liberator') && stats.accessRevocations >= 3) {
      newBadges.push('License Liberator');
    }
    
    // Governance badge
    if (!currentBadges.includes('Governance Guardian') && stats.governanceReviewsCompleted >= 5) {
      newBadges.push('Governance Guardian');
    }
    
    // Super saver badge
    if (!currentBadges.includes('Super Saver') && stats.totalLicenseSeatsSaved >= 25) {
      newBadges.push('Super Saver');
    }
    
    // Dedicated user badge
    if (!currentBadges.includes('Dedicated User') && stats.totalPoints >= 500) {
      newBadges.push('Dedicated User');
    }
    
    // Security Champion badge (for Fastpass verification)
    if (!currentBadges.includes('Security Champion') && stats.fastpassVerified) {
      newBadges.push('Security Champion');
    }
    
    // Update badges in database if new ones were earned
    if (newBadges.length > 0) {
      const updatedBadges = [...currentBadges, ...newBadges];
      await db.update(userGamification)
        .set({ badgesEarned: updatedBadges, updatedAt: new Date() })
        .where(eq(userGamification.oktaId, oktaId));
    }
    
    return newBadges;
  }

  async initializeBadges(): Promise<void> {
    console.log('🎮 Persistent gamification service initialized');
  }

  async recordDailyVisit(oktaId: string): Promise<GamificationResult> {
    try {
      const stats = await this.getOrCreateUserStats(oktaId);
      const today = new Date();
      const lastVisit = stats.lastVisit;
      
      let pointsEarned = 0;
      let streakUpdated = false;
      
      if (!lastVisit || lastVisit.toDateString() !== today.toDateString()) {
        pointsEarned = 10; // Daily visit points
        let newStreak = stats.dailyStreak;
        
        // Update streak
        if (lastVisit) {
          const daysDiff = Math.floor((today.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff === 1) {
            newStreak++;
            streakUpdated = true;
          } else if (daysDiff > 1) {
            newStreak = 1;
            streakUpdated = true;
          }
        } else {
          newStreak = 1;
          streakUpdated = true;
        }
        
        // Calculate new level
        const newExperiencePoints = stats.experiencePoints + pointsEarned;
        const { level, progress } = this.calculateLevel(newExperiencePoints);
        
        // Update database
        await db.update(userGamification)
          .set({
            totalPoints: stats.totalPoints + pointsEarned,
            experiencePoints: newExperiencePoints,
            dailyStreak: newStreak,
            level,
            nextLevelProgress: progress,
            lastVisit: today,
            updatedAt: new Date()
          })
          .where(eq(userGamification.oktaId, oktaId));
        
        await this.addActivity(oktaId, 'daily_visit', pointsEarned, 0, `Daily visit reward (+${pointsEarned} points)`);
      }
      
      // Get updated stats for badge checking
      const updatedStats = await this.getOrCreateUserStats(oktaId);
      const newBadges = await this.checkForNewBadges(oktaId, updatedStats);
      
      return {
        points: pointsEarned,
        licenseSeatsSaved: 0,
        badgesEarned: newBadges
      };
    } catch (error) {
      console.error('❌ Error recording daily visit:', error);
      return { points: 0, licenseSeatsSaved: 0, badgesEarned: [] };
    }
  }

  async recordAccessRequest(oktaId: string, applicationName: string): Promise<GamificationResult> {
    try {
      const stats = await this.getOrCreateUserStats(oktaId);
      const pointsEarned = 25;
      
      // Calculate new values
      const newExperiencePoints = stats.experiencePoints + pointsEarned;
      const { level, progress } = this.calculateLevel(newExperiencePoints);
      
      // Update database
      await db.update(userGamification)
        .set({
          totalPoints: stats.totalPoints + pointsEarned,
          experiencePoints: newExperiencePoints,
          accessRequestsSubmitted: stats.accessRequestsSubmitted + 1,
          level,
          nextLevelProgress: progress,
          updatedAt: new Date()
        })
        .where(eq(userGamification.oktaId, oktaId));
      
      await this.addActivity(oktaId, 'access_request', pointsEarned, 0, `Requested access to ${applicationName}`);
      
      // Get updated stats for badge checking
      const updatedStats = await this.getOrCreateUserStats(oktaId);
      const newBadges = await this.checkForNewBadges(oktaId, updatedStats);
      
      return {
        points: pointsEarned,
        licenseSeatsSaved: 0,
        badgesEarned: newBadges
      };
    } catch (error) {
      console.error('❌ Error recording access request:', error);
      return { points: 0, licenseSeatsSaved: 0, badgesEarned: [] };
    }
  }

  async recordAccessRevocation(oktaId: string, applicationName: string, licenseSeatsSaved: number = 1): Promise<GamificationResult> {
    try {
      const stats = await this.getOrCreateUserStats(oktaId);
      const pointsEarned = 15;
      
      // Calculate new values
      const newExperiencePoints = stats.experiencePoints + pointsEarned;
      const { level, progress } = this.calculateLevel(newExperiencePoints);
      
      // Update database
      await db.update(userGamification)
        .set({
          totalPoints: stats.totalPoints + pointsEarned,
          experiencePoints: newExperiencePoints,
          accessRevocations: stats.accessRevocations + 1,
          totalLicenseSeatsSaved: stats.totalLicenseSeatsSaved + licenseSeatsSaved,
          level,
          nextLevelProgress: progress,
          updatedAt: new Date()
        })
        .where(eq(userGamification.oktaId, oktaId));
      
      await this.addActivity(oktaId, 'access_revocation', pointsEarned, licenseSeatsSaved, `Revoked access to ${applicationName}`);
      
      // Get updated stats for badge checking
      const updatedStats = await this.getOrCreateUserStats(oktaId);
      const newBadges = await this.checkForNewBadges(oktaId, updatedStats);
      
      return {
        points: pointsEarned,
        licenseSeatsSaved,
        badgesEarned: newBadges
      };
    } catch (error) {
      console.error('❌ Error recording access revocation:', error);
      return { points: 0, licenseSeatsSaved: 0, badgesEarned: [] };
    }
  }

  async recordGovernanceReview(oktaId: string): Promise<GamificationResult> {
    try {
      const stats = await this.getOrCreateUserStats(oktaId);
      const pointsEarned = 20;
      
      // Calculate new values
      const newExperiencePoints = stats.experiencePoints + pointsEarned;
      const { level, progress } = this.calculateLevel(newExperiencePoints);
      
      // Update database
      await db.update(userGamification)
        .set({
          totalPoints: stats.totalPoints + pointsEarned,
          experiencePoints: newExperiencePoints,
          governanceReviewsCompleted: stats.governanceReviewsCompleted + 1,
          level,
          nextLevelProgress: progress,
          updatedAt: new Date()
        })
        .where(eq(userGamification.oktaId, oktaId));
      
      await this.addActivity(oktaId, 'governance_review', pointsEarned, 0, 'Completed governance review');
      
      // Get updated stats for badge checking
      const updatedStats = await this.getOrCreateUserStats(oktaId);
      const newBadges = await this.checkForNewBadges(oktaId, updatedStats);
      
      return {
        points: pointsEarned,
        licenseSeatsSaved: 0,
        badgesEarned: newBadges
      };
    } catch (error) {
      console.error('❌ Error recording governance review:', error);
      return { points: 0, licenseSeatsSaved: 0, badgesEarned: [] };
    }
  }

  async recordFastpassVerification(oktaId: string, isFirstTime: boolean): Promise<GamificationResult> {
    try {
      const stats = await this.getOrCreateUserStats(oktaId);
      
      if (isFirstTime && !stats.fastpassVerified) {
        const pointsEarned = 50; // Higher points for security compliance
        
        // Calculate new values
        const newExperiencePoints = stats.experiencePoints + pointsEarned;
        const { level, progress } = this.calculateLevel(newExperiencePoints);
        
        // Update database
        await db.update(userGamification)
          .set({
            totalPoints: stats.totalPoints + pointsEarned,
            experiencePoints: newExperiencePoints,
            fastpassVerified: true,
            level,
            nextLevelProgress: progress,
            lastFastpassCheck: new Date(),
            updatedAt: new Date()
          })
          .where(eq(userGamification.oktaId, oktaId));
        
        await this.addActivity(oktaId, 'fastpass_verification', pointsEarned, 0, 'Verified Fastpass authenticator enrollment');
        
        // Get updated stats for badge checking
        const updatedStats = await this.getOrCreateUserStats(oktaId);
        const newBadges = await this.checkForNewBadges(oktaId, updatedStats);
        
        return {
          points: pointsEarned,
          licenseSeatsSaved: 0,
          badgesEarned: newBadges
        };
      } else {
        // Just update the check timestamp for subsequent checks
        await db.update(userGamification)
          .set({
            lastFastpassCheck: new Date(),
            updatedAt: new Date()
          })
          .where(eq(userGamification.oktaId, oktaId));
        
        return {
          points: 0,
          licenseSeatsSaved: 0,
          badgesEarned: []
        };
      }
    } catch (error) {
      console.error('❌ Error recording Fastpass verification:', error);
      return { points: 0, licenseSeatsSaved: 0, badgesEarned: [] };
    }
  }

  async getUserStats(oktaId: string): Promise<UserStats> {
    try {
      const stats = await this.getOrCreateUserStats(oktaId);
      
      // Get recent activities
      const activities = await db.select()
        .from(activityLogs)
        .where(eq(activityLogs.oktaId, oktaId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(10);
      
      return {
        totalPoints: stats.totalPoints,
        dailyStreak: stats.dailyStreak,
        totalLicenseSeatsSaved: stats.totalLicenseSeatsSaved,
        accessRequestsSubmitted: stats.accessRequestsSubmitted,
        accessRevocations: stats.accessRevocations,
        governanceReviewsCompleted: stats.governanceReviewsCompleted,
        badgesEarned: Array.isArray(stats.badgesEarned) ? stats.badgesEarned : [],
        level: stats.level,
        experiencePoints: stats.experiencePoints,
        recentActivities: activities,
        nextLevelProgress: stats.nextLevelProgress,
        lastVisit: stats.lastVisit || undefined,
        fastpassVerified: stats.fastpassVerified,
        lastFastpassCheck: stats.lastFastpassCheck
      };
    } catch (error) {
      console.error('❌ Error getting user stats:', error);
      // Return default stats if database fails
      return {
        totalPoints: 0,
        dailyStreak: 0,
        totalLicenseSeatsSaved: 0,
        accessRequestsSubmitted: 0,
        accessRevocations: 0,
        governanceReviewsCompleted: 0,
        badgesEarned: [],
        level: 1,
        experiencePoints: 0,
        recentActivities: [],
        nextLevelProgress: 0,
        fastpassVerified: false,
        lastFastpassCheck: null
      };
    }
  }

  async getLeaderboard(period: 'weekly' | 'monthly' | 'all_time' = 'all_time', limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      const results = await db.select({
        oktaId: userGamification.oktaId,
        totalPoints: userGamification.totalPoints,
        totalLicenseSeatsSaved: userGamification.totalLicenseSeatsSaved
      })
      .from(userGamification)
      .orderBy(desc(userGamification.totalPoints))
      .limit(limit);
      
      return results.map((result: any, index: number) => ({
        oktaId: result.oktaId,
        userName: result.oktaId.substring(0, 8) + '...', // Masked user name
        totalPoints: result.totalPoints,
        totalLicenseSeatsSaved: result.totalLicenseSeatsSaved,
        rank: index + 1
      }));
    } catch (error) {
      console.error('❌ Error getting leaderboard:', error);
      return [];
    }
  }
}

export const persistentGamificationService = new PersistentGamificationService();