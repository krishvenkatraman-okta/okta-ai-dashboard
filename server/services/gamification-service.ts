import { db } from '../storage.js';
import { 
  userGamification, 
  activityLogs, 
  badges,
  leaderboards,
  POINTS_SYSTEM,
  APP_COST_ESTIMATES,
  BADGE_DEFINITIONS,
  type UserGamification,
  type InsertActivityLog
} from '../../shared/gamification-schema.js';
import { eq, sql, desc } from 'drizzle-orm';

export class GamificationService {
  
  async initializeUser(oktaId: string): Promise<UserGamification> {
    try {
      // Check if user already exists
      const existing = await db.select()
        .from(userGamification)
        .where(eq(userGamification.oktaId, oktaId))
        .limit(1);

      if (existing.length > 0) {
        return existing[0];
      }

      // Create new gamification profile
      const newUser = await db.insert(userGamification)
        .values({
          oktaId,
          totalPoints: 0,
          dailyStreak: 0,
          lastVisit: new Date(),
          totalCostSaved: '0.00'
        })
        .returning();

      // Award welcome badge
      await this.recordActivity(oktaId, 'first_visit', POINTS_SYSTEM.FIRST_VISIT_BONUS, 0, 'Welcome to Okta AI Dashboard!');
      
      return newUser[0];
    } catch (error) {
      console.error('Error initializing user gamification:', error);
      throw error;
    }
  }

  async recordDailyVisit(oktaId: string): Promise<{ points: number, streak: number, badgesEarned: string[] }> {
    try {
      const user = await this.getOrCreateUser(oktaId);
      const now = new Date();
      const lastVisit = user.lastVisit ? new Date(user.lastVisit) : null;
      
      // Check if this is a new day
      const isNewDay = !lastVisit || 
        now.toDateString() !== lastVisit.toDateString();

      if (!isNewDay) {
        return { points: 0, streak: user.dailyStreak || 0, badgesEarned: [] };
      }

      // Calculate streak
      let newStreak = 1;
      if (lastVisit) {
        const daysDiff = Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff === 1) {
          newStreak = (user.dailyStreak || 0) + 1;
        }
      }

      // Calculate points with streak bonus
      let points = POINTS_SYSTEM.DAILY_VISIT;
      if (newStreak > 7) {
        points = Math.floor(points * POINTS_SYSTEM.STREAK_BONUS_MULTIPLIER);
      }

      // Update user
      await db.update(userGamification)
        .set({
          lastVisit: now,
          dailyStreak: newStreak,
          totalPoints: sql`${userGamification.totalPoints} + ${points}`,
          experiencePoints: sql`${userGamification.experiencePoints} + ${points}`,
          updatedAt: now
        })
        .where(eq(userGamification.oktaId, oktaId));

      // Record activity
      await this.recordActivity(
        oktaId, 
        'daily_visit', 
        points, 
        0, 
        `Daily visit reward ${newStreak > 7 ? '(streak bonus!)' : ''}`
      );

      // Check for new badges
      const badgesEarned = await this.checkAndAwardBadges(oktaId);

      return { points, streak: newStreak, badgesEarned };
    } catch (error) {
      console.error('Error recording daily visit:', error);
      throw error;
    }
  }

  async recordAccessRevocation(oktaId: string, appName: string): Promise<{ points: number, costSaved: number, badgesEarned: string[] }> {
    try {
      // Estimate cost savings
      const costSaved = this.estimateAppCostSavings(appName);
      const points = POINTS_SYSTEM.ACCESS_REVOCATION + Math.floor(costSaved * POINTS_SYSTEM.COST_SAVING_MULTIPLIER);

      // Update user stats
      await db.update(userGamification)
        .set({
          totalPoints: sql`${userGamification.totalPoints} + ${points}`,
          experiencePoints: sql`${userGamification.experiencePoints} + ${points}`,
          totalCostSaved: sql`${userGamification.totalCostSaved} + ${costSaved}`,
          accessRevocations: sql`${userGamification.accessRevocations} + 1`,
          updatedAt: new Date()
        })
        .where(eq(userGamification.oktaId, oktaId));

      // Record activity
      await this.recordActivity(
        oktaId, 
        'access_revocation', 
        points, 
        costSaved, 
        `Revoked access to ${appName} - saved $${costSaved}/month`,
        JSON.stringify({ appName, costSaved })
      );

      // Check for new badges
      const badgesEarned = await this.checkAndAwardBadges(oktaId);

      return { points, costSaved, badgesEarned };
    } catch (error) {
      console.error('Error recording access revocation:', error);
      throw error;
    }
  }

  async recordAccessRequest(oktaId: string, appName: string): Promise<{ points: number, badgesEarned: string[] }> {
    try {
      const points = POINTS_SYSTEM.ACCESS_REQUEST;

      // Update user stats
      await db.update(userGamification)
        .set({
          totalPoints: sql`${userGamification.totalPoints} + ${points}`,
          experiencePoints: sql`${userGamification.experiencePoints} + ${points}`,
          accessRequestsSubmitted: sql`${userGamification.accessRequestsSubmitted} + 1`,
          updatedAt: new Date()
        })
        .where(eq(userGamification.oktaId, oktaId));

      // Record activity
      await this.recordActivity(
        oktaId, 
        'access_request', 
        points, 
        0, 
        `Submitted access request for ${appName}`,
        JSON.stringify({ appName })
      );

      // Check for new badges
      const badgesEarned = await this.checkAndAwardBadges(oktaId);

      return { points, badgesEarned };
    } catch (error) {
      console.error('Error recording access request:', error);
      throw error;
    }
  }

  async recordGovernanceReview(oktaId: string): Promise<{ points: number, badgesEarned: string[] }> {
    try {
      const points = POINTS_SYSTEM.GOVERNANCE_REVIEW;

      // Update user stats
      await db.update(userGamification)
        .set({
          totalPoints: sql`${userGamification.totalPoints} + ${points}`,
          experiencePoints: sql`${userGamification.experiencePoints} + ${points}`,
          governanceReviewsCompleted: sql`${userGamification.governanceReviewsCompleted} + 1`,
          updatedAt: new Date()
        })
        .where(eq(userGamification.oktaId, oktaId));

      // Record activity
      await this.recordActivity(oktaId, 'governance_review', points, 0, 'Completed 30-day governance review');

      // Check for new badges
      const badgesEarned = await this.checkAndAwardBadges(oktaId);

      return { points, badgesEarned };
    } catch (error) {
      console.error('Error recording governance review:', error);
      throw error;
    }
  }

  async getUserStats(oktaId: string): Promise<UserGamification & { recentActivities: any[], nextLevelProgress: number }> {
    try {
      const user = await this.getOrCreateUser(oktaId);
      
      // Get recent activities
      const recentActivities = await db.select()
        .from(activityLogs)
        .where(eq(activityLogs.oktaId, oktaId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(10);

      // Calculate level progress
      const currentLevel = user.level || 1;
      const nextLevelXP = currentLevel * 1000; // 1000 XP per level
      const currentXP = user.experiencePoints || 0;
      const nextLevelProgress = Math.min((currentXP % nextLevelXP) / nextLevelXP * 100, 100);

      return {
        ...user,
        recentActivities,
        nextLevelProgress
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }

  async getLeaderboard(period: 'weekly' | 'monthly' | 'all_time' = 'all_time', limit: number = 10) {
    try {
      return await db.select()
        .from(leaderboards)
        .where(eq(leaderboards.period, period))
        .orderBy(desc(leaderboards.totalPoints))
        .limit(limit);
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      throw error;
    }
  }

  private async getOrCreateUser(oktaId: string): Promise<UserGamification> {
    const existing = await db.select()
      .from(userGamification)
      .where(eq(userGamification.oktaId, oktaId))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    return await this.initializeUser(oktaId);
  }

  private async recordActivity(oktaId: string, activityType: string, pointsEarned: number, costSaved: number, description: string, metadata?: string) {
    await db.insert(activityLogs).values({
      oktaId,
      activityType,
      pointsEarned,
      costSaved: costSaved.toString(),
      description,
      metadata
    });
  }

  private estimateAppCostSavings(appName: string): number {
    // Find matching app cost or use default
    const appKey = Object.keys(APP_COST_ESTIMATES).find(key => 
      appName.toLowerCase().includes(key.toLowerCase())
    ) as keyof typeof APP_COST_ESTIMATES;

    const cost = APP_COST_ESTIMATES[appKey] || APP_COST_ESTIMATES.default;
    return cost.monthly;
  }

  private async checkAndAwardBadges(oktaId: string): Promise<string[]> {
    try {
      const user = await db.select()
        .from(userGamification)
        .where(eq(userGamification.oktaId, oktaId))
        .limit(1);

      if (user.length === 0) return [];

      const userStats = user[0];
      const currentBadges = userStats.badgesEarned || [];
      const newBadges: string[] = [];

      // Check each badge definition
      for (const badgeDef of BADGE_DEFINITIONS) {
        if (currentBadges.includes(badgeDef.name)) continue;

        const requirement = JSON.parse(badgeDef.requirement);
        let shouldAward = false;

        switch (requirement.type) {
          case 'daily_visit':
            shouldAward = true; // First visit badge
            break;
          case 'daily_streak':
            shouldAward = (userStats.dailyStreak || 0) >= requirement.count;
            break;
          case 'cost_saved':
            shouldAward = parseFloat(userStats.totalCostSaved || '0') >= requirement.amount;
            break;
          case 'access_revocations':
            shouldAward = (userStats.accessRevocations || 0) >= requirement.count;
            break;
          case 'governance_reviews':
            shouldAward = (userStats.governanceReviewsCompleted || 0) >= requirement.count;
            break;
        }

        if (shouldAward) {
          newBadges.push(badgeDef.name);
          
          // Award badge points
          await db.update(userGamification)
            .set({
              badgesEarned: sql`array_append(${userGamification.badgesEarned}, ${badgeDef.name})`,
              totalPoints: sql`${userGamification.totalPoints} + ${badgeDef.pointsReward}`,
              experiencePoints: sql`${userGamification.experiencePoints} + ${badgeDef.pointsReward}`,
              updatedAt: new Date()
            })
            .where(eq(userGamification.oktaId, oktaId));

          // Record badge activity
          await this.recordActivity(
            oktaId,
            'badge_earned',
            badgeDef.pointsReward,
            0,
            `Earned badge: ${badgeDef.name}`,
            JSON.stringify({ badgeName: badgeDef.name, rarity: badgeDef.rarity })
          );
        }
      }

      return newBadges;
    } catch (error) {
      console.error('Error checking badges:', error);
      return [];
    }
  }

  async initializeBadges() {
    try {
      // Check if badges already exist
      const existingBadges = await db.select().from(badges).limit(1);
      if (existingBadges.length > 0) return;

      // Insert all badge definitions
      for (const badge of BADGE_DEFINITIONS) {
        await db.insert(badges).values(badge);
      }

      console.log('✅ Gamification badges initialized');
    } catch (error) {
      console.error('Error initializing badges:', error);
    }
  }
}

export const gamificationService = new GamificationService();