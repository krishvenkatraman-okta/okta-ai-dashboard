import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Shield, 
  Clock, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  Calendar,
  BarChart3,
  Activity,
  Eye
} from "lucide-react";

interface GovernanceData {
  campaigns: any[];
  accessReviews: any[];
  pendingRequests: number;
  complianceScore: number;
  riskScore: number;
  lastReview: string;
  upcomingDeadlines: any[];
}

interface WidgetProps {
  userId?: string;
  userRole?: string;
}

export function GovernanceWidgets({ userId, userRole }: WidgetProps) {
  const [data, setData] = useState<GovernanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGovernanceData();
  }, [userId]);

  const fetchGovernanceData = async () => {
    try {
      setLoading(true);
      
      // Fetch multiple governance data sources in parallel
      const [campaignsRes, reviewsRes, requestsRes] = await Promise.all([
        fetch('/api/governance/campaigns', { credentials: 'include' }),
        fetch('/api/governance/access-reviews', { credentials: 'include' }),
        fetch('/api/governance/pending-requests', { credentials: 'include' })
      ]);

      const campaigns = campaignsRes.ok ? await campaignsRes.json() : [];
      const reviews = reviewsRes.ok ? await reviewsRes.json() : [];
      const requests = requestsRes.ok ? await requestsRes.json() : { count: 0 };

      // Calculate governance metrics
      const complianceScore = calculateComplianceScore(campaigns, reviews);
      const riskScore = calculateRiskScore(reviews, requests.count);
      
      setData({
        campaigns,
        accessReviews: reviews,
        pendingRequests: requests.count,
        complianceScore,
        riskScore,
        lastReview: reviews.length > 0 ? reviews[0]?.lastModified : null,
        upcomingDeadlines: getUpcomingDeadlines(campaigns, reviews)
      });
    } catch (error) {
      console.error('Error fetching governance data:', error);
      setError('Failed to load governance insights');
    } finally {
      setLoading(false);
    }
  };

  const calculateComplianceScore = (campaigns: any[], reviews: any[]): number => {
    if (campaigns.length === 0 && reviews.length === 0) return 85; // Default baseline
    
    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;
    const completedReviews = reviews.filter(r => r.status === 'COMPLETED').length;
    const totalItems = campaigns.length + reviews.length;
    
    if (totalItems === 0) return 85;
    
    const completionRate = (activeCampaigns + completedReviews) / totalItems;
    return Math.round(completionRate * 100);
  };

  const calculateRiskScore = (reviews: any[], pendingRequests: number): number => {
    const overdueReviews = reviews.filter(r => {
      if (!r.dueDate) return false;
      return new Date(r.dueDate) < new Date();
    }).length;
    
    // Risk increases with overdue reviews and pending requests
    const riskFactor = (overdueReviews * 10) + (pendingRequests * 2);
    return Math.min(Math.max(riskFactor, 5), 95); // Keep between 5-95
  };

  const getUpcomingDeadlines = (campaigns: any[], reviews: any[]): any[] => {
    const allItems = [...campaigns, ...reviews];
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    return allItems
      .filter(item => item.dueDate && new Date(item.dueDate) <= nextWeek && new Date(item.dueDate) >= now)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);
  };

  if (loading) {
    return <GovernanceWidgetsSkeleton />;
  }

  if (error) {
    return <GovernanceErrorWidget error={error} onRetry={fetchGovernanceData} />;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <ComplianceScoreWidget score={data.complianceScore} />
      <RiskAssessmentWidget score={data.riskScore} />
      <ActiveCampaignsWidget campaigns={data.campaigns} />
      <PendingRequestsWidget count={data.pendingRequests} />
      <AccessReviewWidget reviews={data.accessReviews} />
      <UpcomingDeadlinesWidget deadlines={data.upcomingDeadlines} />
    </div>
  );
}

function ComplianceScoreWidget({ score }: { score: number }) {
  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreVariant = (score: number) => {
    if (score >= 90) return "default";
    if (score >= 70) return "secondary";
    return "destructive";
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
        <Shield className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2">
          <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
            {score}%
          </div>
          <Badge variant={getScoreVariant(score)} className="text-xs">
            {score >= 90 ? "Excellent" : score >= 70 ? "Good" : "Needs Attention"}
          </Badge>
        </div>
        <Progress value={score} className="mt-2" />
        <p className="text-xs text-muted-foreground mt-2">
          Based on active campaigns and reviews
        </p>
      </CardContent>
    </Card>
  );
}

function RiskAssessmentWidget({ score }: { score: number }) {
  const getRiskLevel = (score: number) => {
    if (score <= 20) return { level: "Low", color: "text-green-600", variant: "default" as const };
    if (score <= 50) return { level: "Medium", color: "text-yellow-600", variant: "secondary" as const };
    return { level: "High", color: "text-red-600", variant: "destructive" as const };
  };

  const risk = getRiskLevel(score);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Risk Assessment</CardTitle>
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2">
          <div className={`text-2xl font-bold ${risk.color}`}>
            {risk.level}
          </div>
          <Badge variant={risk.variant} className="text-xs">
            {score}/100
          </Badge>
        </div>
        <Progress value={score} className="mt-2" />
        <p className="text-xs text-muted-foreground mt-2">
          Overdue reviews and pending requests
        </p>
      </CardContent>
    </Card>
  );
}

function ActiveCampaignsWidget({ campaigns }: { campaigns: any[] }) {
  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE' || !c.status);
  
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{activeCampaigns.length}</div>
        <p className="text-xs text-muted-foreground">
          {campaigns.length} total campaigns
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {activeCampaigns.slice(0, 3).map((campaign, idx) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {campaign.name?.slice(0, 10)}...
            </Badge>
          ))}
          {activeCampaigns.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{activeCampaigns.length - 3} more
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PendingRequestsWidget({ count }: { count: number }) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
        <p className="text-xs text-muted-foreground">
          Awaiting approval
        </p>
        {count > 0 && (
          <Button variant="outline" size="sm" className="mt-2 w-full">
            Review Requests
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AccessReviewWidget({ reviews }: { reviews: any[] }) {
  const recentReviews = reviews.slice(0, 3);
  
  return (
    <Card className="md:col-span-2 hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Recent Access Reviews</CardTitle>
        <Eye className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recentReviews.length > 0 ? (
            recentReviews.map((review, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <div className="font-medium text-sm">
                    {review.name || review.displayName || `Review ${idx + 1}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {review.lastModified ? new Date(review.lastModified).toLocaleDateString() : 'No date'}
                  </div>
                </div>
                <Badge variant={review.status === 'COMPLETED' ? 'default' : 'secondary'}>
                  {review.status || 'Active'}
                </Badge>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No recent access reviews
            </div>
          )}
        </div>
        <Button variant="outline" className="w-full mt-3">
          View All Reviews
        </Button>
      </CardContent>
    </Card>
  );
}

function UpcomingDeadlinesWidget({ deadlines }: { deadlines: any[] }) {
  return (
    <Card className="md:col-span-2 lg:col-span-4 hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Upcoming Deadlines</CardTitle>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {deadlines.length > 0 ? (
            deadlines.map((item, idx) => (
              <div key={idx} className="p-3 border rounded-lg">
                <div className="font-medium text-sm mb-1">
                  {item.name || `Item ${idx + 1}`}
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  Due: {new Date(item.dueDate).toLocaleDateString()}
                </div>
                <Badge variant="outline" className="text-xs">
                  {getDaysUntilDue(item.dueDate)} days left
                </Badge>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-4 text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
              No upcoming deadlines this week
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  const diffTime = due.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function GovernanceWidgetsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-2 w-full mb-2" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GovernanceErrorWidget({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card className="col-span-full">
      <CardContent className="pt-6">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-600" />
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={onRetry} variant="outline">
            Retry
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}