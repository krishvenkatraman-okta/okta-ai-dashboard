// Simple in-memory gamification service
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

interface ActivityLog {
  id: number;
  activityType: string;
  pointsEarned: number;
  licenseSeatsSaved: number;
  description: string;
  createdAt: string;
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

class SimpleGamificationService {
  private userStats = new Map<string, UserStats>();
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

  private getOrCreateUserStats(oktaId: string): UserStats {
    if (!this.userStats.has(oktaId)) {
      this.userStats.set(oktaId, {
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
      });
    }
    return this.userStats.get(oktaId)!;
  }

  private calculateLevel(points: number): { level: number; progress: number } {
    const level = Math.floor(points / 100) + 1;
    const progress = ((points % 100) / 100) * 100;
    return { level, progress };
  }

  private addActivity(oktaId: string, activityType: string, points: number, licenseSeatsSaved: number, description: string) {
    const stats = this.getOrCreateUserStats(oktaId);
    const activity: ActivityLog = {
      id: Date.now(),
      activityType,
      pointsEarned: points,
      licenseSeatsSaved,
      description,
      createdAt: new Date().toISOString()
    };
    
    stats.recentActivities.unshift(activity);
    if (stats.recentActivities.length > 10) {
      stats.recentActivities = stats.recentActivities.slice(0, 10);
    }
  }

  private checkForNewBadges(oktaId: string, stats: UserStats): string[] {
    const newBadges: string[] = [];
    
    // Welcome badge
    if (!stats.badgesEarned.includes('Welcome Aboard') && stats.totalPoints >= 10) {
      newBadges.push('Welcome Aboard');
    }
    
    // Daily streak badge
    if (!stats.badgesEarned.includes('Daily Warrior') && stats.dailyStreak >= 7) {
      newBadges.push('Daily Warrior');
    }
    
    // License seats saved badge
    if (!stats.badgesEarned.includes('Cost Conscious') && stats.totalLicenseSeatsSaved >= 5) {
      newBadges.push('Cost Conscious');
    }
    
    // Access revocation badge
    if (!stats.badgesEarned.includes('License Liberator') && stats.accessRevocations >= 3) {
      newBadges.push('License Liberator');
    }
    
    // Governance badge
    if (!stats.badgesEarned.includes('Governance Guardian') && stats.governanceReviewsCompleted >= 5) {
      newBadges.push('Governance Guardian');
    }
    
    // Super saver badge
    if (!stats.badgesEarned.includes('Super Saver') && stats.totalLicenseSeatsSaved >= 25) {
      newBadges.push('Super Saver');
    }
    
    // Dedicated user badge
    if (!stats.badgesEarned.includes('Dedicated User') && stats.totalPoints >= 500) {
      newBadges.push('Dedicated User');
    }
    
    // Security Champion badge (for Fastpass verification)
    if (!stats.badgesEarned.includes('Security Champion') && stats.fastpassVerified) {
      newBadges.push('Security Champion');
    }
    
    stats.badgesEarned.push(...newBadges);
    return newBadges;
  }

  async initializeBadges(): Promise<void> {
    // No-op for in-memory version
    console.log('🎮 Simple gamification service initialized');
  }

  async recordDailyVisit(oktaId: string): Promise<GamificationResult> {
    const stats = this.getOrCreateUserStats(oktaId);
    const today = new Date();
    const lastVisit = stats.lastVisit;
    
    let pointsEarned = 0;
    let streakUpdated = false;
    
    if (!lastVisit || lastVisit.toDateString() !== today.toDateString()) {
      pointsEarned = 10; // Daily visit points
      stats.totalPoints += pointsEarned;
      stats.experiencePoints += pointsEarned;
      
      // Update streak
      if (lastVisit) {
        const daysDiff = Math.floor((today.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff === 1) {
          stats.dailyStreak++;
          streakUpdated = true;
        } else if (daysDiff > 1) {
          stats.dailyStreak = 1;
          streakUpdated = true;
        }
      } else {
        stats.dailyStreak = 1;
        streakUpdated = true;
      }
      
      stats.lastVisit = today;
      
      // Update level
      const { level, progress } = this.calculateLevel(stats.experiencePoints);
      stats.level = level;
      stats.nextLevelProgress = progress;
      
      this.addActivity(oktaId, 'daily_visit', pointsEarned, 0, `Daily visit reward (+${pointsEarned} points)`);
    }
    
    const newBadges = this.checkForNewBadges(oktaId, stats);
    
    return {
      points: pointsEarned,
      licenseSeatsSaved: 0,
      badgesEarned: newBadges
    };
  }

  async recordAccessRequest(oktaId: string, applicationName: string): Promise<GamificationResult> {
    const stats = this.getOrCreateUserStats(oktaId);
    const pointsEarned = 25;
    
    stats.totalPoints += pointsEarned;
    stats.experiencePoints += pointsEarned;
    stats.accessRequestsSubmitted++;
    
    // Update level
    const { level, progress } = this.calculateLevel(stats.experiencePoints);
    stats.level = level;
    stats.nextLevelProgress = progress;
    
    this.addActivity(oktaId, 'access_request', pointsEarned, 0, `Submitted access request for ${applicationName}`);
    
    const newBadges = this.checkForNewBadges(oktaId, stats);
    
    return {
      points: pointsEarned,
      licenseSeatsSaved: 0,
      badgesEarned: newBadges
    };
  }

  async recordAccessRevocation(oktaId: string, applicationName: string): Promise<GamificationResult> {
    const stats = this.getOrCreateUserStats(oktaId);
    const pointsEarned = 50;
    const licenseSeatsSaved = 1; // Each revocation saves exactly 1 license seat
    
    stats.totalPoints += pointsEarned;
    stats.experiencePoints += pointsEarned;
    stats.accessRevocations++;
    stats.totalLicenseSeatsSaved += licenseSeatsSaved;
    
    // Update level
    const { level, progress } = this.calculateLevel(stats.experiencePoints);
    stats.level = level;
    stats.nextLevelProgress = progress;
    
    this.addActivity(oktaId, 'access_revocation', pointsEarned, licenseSeatsSaved, `Revoked unused access to ${applicationName} (saved 1 license seat)`);
    
    const newBadges = this.checkForNewBadges(oktaId, stats);
    
    return {
      points: pointsEarned,
      licenseSeatsSaved,
      badgesEarned: newBadges
    };
  }

  async recordGovernanceReview(oktaId: string): Promise<GamificationResult> {
    const stats = this.getOrCreateUserStats(oktaId);
    const pointsEarned = 30;
    
    stats.totalPoints += pointsEarned;
    stats.experiencePoints += pointsEarned;
    stats.governanceReviewsCompleted++;
    
    // Update level
    const { level, progress } = this.calculateLevel(stats.experiencePoints);
    stats.level = level;
    stats.nextLevelProgress = progress;
    
    this.addActivity(oktaId, 'governance_review', pointsEarned, 0, 'Completed governance review');
    
    const newBadges = this.checkForNewBadges(oktaId, stats);
    
    return {
      points: pointsEarned,
      licenseSeatsSaved: 0,
      badgesEarned: newBadges
    };
  }

  async recordFastpassVerification(oktaId: string, isFirstTime: boolean): Promise<GamificationResult> {
    const stats = this.getOrCreateUserStats(oktaId);
    
    if (isFirstTime && !stats.fastpassVerified) {
      const pointsEarned = 50; // Higher points for security compliance
      
      stats.totalPoints += pointsEarned;
      stats.experiencePoints += pointsEarned;
      stats.fastpassVerified = true;
      
      // Update level
      const { level, progress } = this.calculateLevel(stats.experiencePoints);
      stats.level = level;
      stats.nextLevelProgress = progress;
      
      this.addActivity(oktaId, 'fastpass_verification', pointsEarned, 0, 'Verified Fastpass authenticator enrollment');
      
      stats.lastFastpassCheck = new Date();
      
      const newBadges = this.checkForNewBadges(oktaId, stats);
      
      return {
        points: pointsEarned,
        licenseSeatsSaved: 0,
        badgesEarned: newBadges
      };
    } else {
      // Just update the check timestamp for subsequent checks
      stats.lastFastpassCheck = new Date();
      
      return {
        points: 0,
        licenseSeatsSaved: 0,
        badgesEarned: []
      };
    }
  }

  async getUserStats(oktaId: string): Promise<UserStats> {
    return this.getOrCreateUserStats(oktaId);
  }

  async getLeaderboard(period: 'weekly' | 'monthly' | 'all_time' = 'all_time', limit: number = 10): Promise<LeaderboardEntry[]> {
    const leaderboard: LeaderboardEntry[] = [];
    
    for (const [oktaId, stats] of Array.from(this.userStats.entries())) {
      leaderboard.push({
        oktaId,
        userName: oktaId.substring(0, 8) + '...', // Masked user name
        totalPoints: stats.totalPoints,
        totalLicenseSeatsSaved: stats.totalLicenseSeatsSaved,
        rank: 0
      });
    }
    
    // Sort by total points descending
    leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
    
    // Add ranks
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    return leaderboard.slice(0, limit);
  }
}

export const gamificationService = new SimpleGamificationService();