import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, Coins, Flame, Target, Star, TrendingUp } from 'lucide-react';

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

const BADGE_ICONS: Record<string, string> = {
  'Welcome Aboard': '🎯',
  'Daily Warrior': '🔥',
  'Cost Conscious': '💰',
  'License Liberator': '🚫',
  'Governance Guardian': '🛡️',
  'Super Saver': '🏆',
  'Dedicated User': '⭐',
  'Security Champion': '🔒'
};

const BADGE_RARITIES: Record<string, { color: string, label: string }> = {
  'common': { color: 'bg-gray-100 text-gray-800 border-gray-200', label: 'Common' },
  'rare': { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Rare' },
  'epic': { color: 'bg-purple-100 text-purple-800 border-purple-200', label: 'Epic' },
  'legendary': { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Legendary' }
};

export function GamificationWidget() {
  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ['/api/gamification/stats'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['/api/gamification/leaderboard'],
    refetchInterval: 60000 // Refresh every minute
  });

  if (statsLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Loading Your Progress...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const formatLicenseSeats = (seats: number) => {
    return seats === 1 ? '1 license seat' : `${seats} license seats`;
  };

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-sm text-gray-600">Total Points</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.totalPoints?.toLocaleString() || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-gray-600">Daily Streak</p>
                <p className="text-2xl font-bold text-orange-600">{stats.dailyStreak || 0} days</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-gray-600">License Seats Saved</p>
                <p className="text-2xl font-bold text-green-600">{stats.totalLicenseSeatsSaved || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-gray-600">Level</p>
                <p className="text-2xl font-bold text-blue-600">{stats.level || 1}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Level Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Level Progress
          </CardTitle>
          <CardDescription>
            Level {stats.level || 1} • {stats.experiencePoints || 0} XP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={stats.nextLevelProgress || 0} className="w-full" />
          <p className="text-sm text-gray-600 mt-2">
            {Math.round(stats.nextLevelProgress || 0)}% to Level {(stats.level || 1) + 1}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Badges */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Your Badges
            </CardTitle>
            <CardDescription>
              {stats.badgesEarned?.length || 0} badges earned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.badgesEarned && stats.badgesEarned.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {stats.badgesEarned.map((badgeName, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="flex items-center gap-1 px-3 py-1"
                  >
                    <span className="text-lg">{BADGE_ICONS[badgeName] || '🏅'}</span>
                    <span className="text-sm">{badgeName}</span>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">
                Complete actions to earn your first badge! Try submitting an access request or completing a 30-day review.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
            <CardDescription>
              Your latest governance actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentActivities && stats.recentActivities.length > 0 ? (
              <div className="space-y-3">
                {stats.recentActivities.slice(0, 5).map((activity, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.description}</p>
                      <p className="text-xs text-gray-600">
                        {new Date(activity.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">+{activity.pointsEarned}</p>
                      {activity.licenseSeatsSaved > 0 && (
                        <p className="text-xs text-gray-600">
                          {formatLicenseSeats(activity.licenseSeatsSaved)} saved
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">
                No recent activities. Start by asking the AI assistant for help!
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      {!leaderboardLoading && leaderboard && leaderboard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Leaderboard
            </CardTitle>
            <CardDescription>
              Top performers in governance activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {leaderboard.slice(0, 5).map((entry, index) => (
                <div
                  key={entry.oktaId}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    index === 0 ? 'bg-yellow-50 border border-yellow-200' :
                    index === 1 ? 'bg-gray-50 border border-gray-200' :
                    index === 2 ? 'bg-orange-50 border border-orange-200' :
                    'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? 'bg-yellow-200 text-yellow-800' :
                      index === 1 ? 'bg-gray-200 text-gray-800' :
                      index === 2 ? 'bg-orange-200 text-orange-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {index + 1}
                    </span>
                    <span className="font-medium">{entry.userName}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600">{entry.totalPoints.toLocaleString()} pts</p>
                    <p className="text-xs text-gray-600">{formatLicenseSeats(entry.totalLicenseSeatsSaved)} saved</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}