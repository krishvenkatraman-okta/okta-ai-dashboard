import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Users,
  Shield,
  Activity,
  RefreshCw,
  Download,
  Settings
} from "lucide-react";

interface AdvancedGovernanceProps {
  userRole?: string;
}

export function AdvancedGovernanceDashboard({ userRole }: AdvancedGovernanceProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setLastRefresh(new Date());
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Advanced Governance Dashboard</h3>
          <p className="text-sm text-gray-600">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Configure
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ComplianceTrendCard />
            <RiskHeatmapCard />
            <ActivitySummaryCard />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentActivitiesCard />
            <UpcomingTasksCard />
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <CampaignManagementPanel />
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4">
          <ComplianceDetailsPanel />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <AnalyticsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ComplianceTrendCard() {
  const trendData = [95, 92, 89, 94, 96, 93, 97];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center">
          <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
          Compliance Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-green-600 mb-2">97%</div>
        <div className="flex items-center space-x-1 text-xs text-gray-600">
          <span>7-day trend:</span>
          <div className="flex space-x-1">
            {trendData.map((score, idx) => (
              <div 
                key={idx}
                className="w-1 bg-green-500 rounded"
                style={{ height: `${score / 100 * 20}px` }}
              />
            ))}
          </div>
          <span className="text-green-600">+4%</span>
        </div>
      </CardContent>
    </Card>
  );
}

function RiskHeatmapCard() {
  const riskAreas = [
    { area: "High-Privilege Access", level: "medium", score: 35 },
    { area: "Stale Accounts", level: "low", score: 15 },
    { area: "External Users", level: "high", score: 65 },
    { area: "Admin Roles", level: "medium", score: 40 }
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center">
          <AlertCircle className="h-4 w-4 mr-2 text-orange-600" />
          Risk Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {riskAreas.map((risk, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="truncate">{risk.area}</span>
              <Badge 
                variant={risk.level === "high" ? "destructive" : risk.level === "medium" ? "secondary" : "default"}
                className="text-xs"
              >
                {risk.score}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivitySummaryCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center">
          <Activity className="h-4 w-4 mr-2 text-blue-600" />
          Activity (24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span>Access Requests</span>
            <span className="font-medium">12</span>
          </div>
          <div className="flex justify-between">
            <span>Reviews Completed</span>
            <span className="font-medium">8</span>
          </div>
          <div className="flex justify-between">
            <span>Policy Violations</span>
            <span className="font-medium text-red-600">2</span>
          </div>
          <div className="flex justify-between">
            <span>Approvals Pending</span>
            <span className="font-medium text-orange-600">5</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivitiesCard() {
  const activities = [
    { time: "2 min ago", action: "Access request approved", user: "John Doe", type: "approval" },
    { time: "15 min ago", action: "Campaign started", user: "System", type: "campaign" },
    { time: "1 hr ago", action: "Policy violation detected", user: "Jane Smith", type: "violation" },
    { time: "3 hr ago", action: "Review completed", user: "Admin", type: "review" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent Activities</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.map((activity, idx) => (
            <div key={idx} className="flex items-center space-x-3 text-sm">
              <div className={`w-2 h-2 rounded-full ${
                activity.type === 'approval' ? 'bg-green-500' :
                activity.type === 'violation' ? 'bg-red-500' :
                activity.type === 'campaign' ? 'bg-blue-500' :
                'bg-gray-500'
              }`} />
              <div className="flex-1">
                <div className="font-medium">{activity.action}</div>
                <div className="text-xs text-gray-600">{activity.user} • {activity.time}</div>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="w-full mt-4">
          View All Activities
        </Button>
      </CardContent>
    </Card>
  );
}

function UpcomingTasksCard() {
  const tasks = [
    { task: "Quarterly Admin Review", due: "2 days", priority: "high" },
    { task: "Service Account Audit", due: "1 week", priority: "medium" },
    { task: "Policy Update Review", due: "2 weeks", priority: "low" },
    { task: "Emergency Access Review", due: "3 days", priority: "high" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Upcoming Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tasks.map((task, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-sm font-medium">{task.task}</div>
                <div className="text-xs text-gray-600">Due in {task.due}</div>
              </div>
              <Badge 
                variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "secondary" : "default"}
                className="text-xs"
              >
                {task.priority}
              </Badge>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="w-full mt-4">
          Manage Tasks
        </Button>
      </CardContent>
    </Card>
  );
}

function CampaignManagementPanel() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Active Campaigns</CardTitle>
          <CardDescription>Currently running governance campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Q1 Access Review {i}</h4>
                  <Badge variant="default">Active</Badge>
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Progress: 65% complete
                </div>
                <Progress value={65} className="mb-2" />
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Started: Jan 15, 2025</span>
                  <span>Due: Jan 30, 2025</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Statistics</CardTitle>
          <CardDescription>Performance metrics for governance campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">12</div>
                <div className="text-sm text-gray-600">Total Campaigns</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">8</div>
                <div className="text-sm text-gray-600">Completed</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">3</div>
                <div className="text-sm text-gray-600">In Progress</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">1</div>
                <div className="text-sm text-gray-600">Scheduled</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComplianceDetailsPanel() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Compliance Overview</CardTitle>
          <CardDescription>Detailed compliance metrics and status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-green-600 mb-2">97%</div>
              <div className="text-sm font-medium">Overall Score</div>
              <div className="text-xs text-gray-600">Excellent compliance</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-blue-600 mb-2">156</div>
              <div className="text-sm font-medium">Policies</div>
              <div className="text-xs text-gray-600">All up to date</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-orange-600 mb-2">3</div>
              <div className="text-sm font-medium">Violations</div>
              <div className="text-xs text-gray-600">This month</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy Compliance Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { policy: "Password Policy", compliance: 98, status: "excellent" },
              { policy: "MFA Enforcement", compliance: 95, status: "good" },
              { policy: "Access Review Policy", compliance: 92, status: "good" },
              { policy: "Data Classification", compliance: 88, status: "needs_attention" },
            ].map((item, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.policy}</span>
                  <span className="text-sm font-bold">{item.compliance}%</span>
                </div>
                <Progress value={item.compliance} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsPanel() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Request Trends</CardTitle>
            <CardDescription>Weekly access request volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-center space-x-2">
              {[45, 32, 28, 41, 37, 52, 48].map((height, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  <div 
                    className="w-8 bg-blue-500 rounded-t"
                    style={{ height: `${height * 3}px` }}
                  />
                  <div className="text-xs text-gray-600 mt-1">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx]}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Distribution</CardTitle>
            <CardDescription>Risk levels across the organization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Low Risk</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 h-2 bg-gray-200 rounded">
                    <div className="w-24 h-2 bg-green-500 rounded" />
                  </div>
                  <span className="text-sm font-medium">75%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Medium Risk</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 h-2 bg-gray-200 rounded">
                    <div className="w-8 h-2 bg-yellow-500 rounded" />
                  </div>
                  <span className="text-sm font-medium">20%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">High Risk</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 h-2 bg-gray-200 rounded">
                    <div className="w-2 h-2 bg-red-500 rounded" />
                  </div>
                  <span className="text-sm font-medium">5%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}