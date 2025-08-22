import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/utils/trpc';
import type { 
  User, 
  InventoryItem, 
  MealPlan, 
  ConnectUserInput, 
  WeeklyMealPlan, 
  ShoppingGapItem 
} from '../../server/src/schema';
import { 
  RefreshCw, 
  Calendar, 
  ShoppingCart, 
  Slack, 
  AlertTriangle, 
  CheckCircle,
  Coffee,
  UtensilsCrossed,
  Moon
} from 'lucide-react';

function App() {
  // User and connection state
  const [user, setUser] = useState<User | null>(null);
  const [householdId, setHouseholdId] = useState('');
  const [inventoryEndpoint, setInventoryEndpoint] = useState('');
  const [slackChannel, setSlackChannel] = useState('');
  const [autoSendSlack, setAutoSendSlack] = useState(false);

  // Inventory state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);

  // Meal plan state
  const [currentMealPlan, setCurrentMealPlan] = useState<MealPlan | null>(null);
  const [parsedMealPlan, setParsedMealPlan] = useState<WeeklyMealPlan | null>(null);
  const [shoppingGaps, setShoppingGaps] = useState<ShoppingGapItem[]>([]);
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState('setup');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendingToSlack, setIsSendingToSlack] = useState(false);

  // Show notification toast
  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Load user by household ID
  const loadUser = useCallback(async (householdIdToLoad: string) => {
    try {
      const foundUser = await trpc.getUserByHousehold.query({ household_id: householdIdToLoad });
      if (foundUser) {
        setUser(foundUser);
        setSlackChannel(foundUser.slack_channel || '');
        setAutoSendSlack(foundUser.auto_send_slack);
        setActiveTab('inventory');
        showNotification('success', 'Connected to household successfully!');
        return foundUser;
      } else {
        showNotification('error', 'Household not found. Please connect first.');
        return null;
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      showNotification('error', 'Failed to load household data');
      return null;
    }
  }, [showNotification]);

  // Connect new user
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdId || !inventoryEndpoint) {
      showNotification('error', 'Please provide both household ID and inventory endpoint');
      return;
    }

    setIsConnecting(true);
    try {
      const connectData: ConnectUserInput = {
        household_id: householdId,
        inventory_endpoint: inventoryEndpoint,
        slack_channel: slackChannel || null,
        auto_send_slack: autoSendSlack
      };

      const newUser = await trpc.connectUser.mutate(connectData);
      setUser(newUser);
      setActiveTab('inventory');
      showNotification('success', 'Connected successfully! You can now manage your inventory.');
    } catch (error) {
      console.error('Failed to connect:', error);
      showNotification('error', 'Failed to connect. Please check your details and try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Load inventory
  const loadInventory = useCallback(async (userId: number) => {
    setIsLoadingInventory(true);
    try {
      const inventoryData = await trpc.getInventory.query({ user_id: userId });
      setInventory(inventoryData);
    } catch (error) {
      console.error('Failed to load inventory:', error);
      showNotification('error', 'Failed to load inventory');
    } finally {
      setIsLoadingInventory(false);
    }
  }, [showNotification]);

  // Refresh inventory from external endpoint
  const handleRefreshInventory = async () => {
    if (!user) return;
    
    setIsRefreshing(true);
    try {
      await trpc.refreshInventory.mutate({ user_id: user.id });
      await loadInventory(user.id);
      showNotification('success', 'Inventory refreshed successfully!');
    } catch (error) {
      console.error('Failed to refresh inventory:', error);
      showNotification('error', 'Failed to refresh inventory from external source');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Load current meal plan
  const loadMealPlan = useCallback(async (userId: number) => {
    try {
      const mealPlan = await trpc.getMealPlan.query({ user_id: userId });
      setCurrentMealPlan(mealPlan);
      
      if (mealPlan) {
        try {
          const parsed: WeeklyMealPlan = JSON.parse(mealPlan.plan_data);
          const gaps: ShoppingGapItem[] = JSON.parse(mealPlan.shopping_gaps);
          setParsedMealPlan(parsed);
          setShoppingGaps(gaps);
        } catch (parseError) {
          console.error('Failed to parse meal plan data:', parseError);
          showNotification('error', 'Failed to parse meal plan data');
        }
      } else {
        setParsedMealPlan(null);
        setShoppingGaps([]);
      }
    } catch (error) {
      console.error('Failed to load meal plan:', error);
      showNotification('error', 'Failed to load meal plan');
    }
  }, [showNotification]);

  // Generate new meal plan
  const handleGenerateMealPlan = async () => {
    if (!user) return;

    setIsGeneratingMealPlan(true);
    try {
      await trpc.generateMealPlan.mutate({ user_id: user.id });
      await loadMealPlan(user.id);
      showNotification('success', 'Meal plan generated successfully!');
      
      // Auto-send to Slack if enabled and meal plan was created
      if (user.auto_send_slack && currentMealPlan && user.slack_channel) {
        handleSendToSlack();
      }
    } catch (error) {
      console.error('Failed to generate meal plan:', error);
      showNotification('error', 'Failed to generate meal plan. Please try again.');
    } finally {
      setIsGeneratingMealPlan(false);
    }
  };

  // Send meal plan to Slack
  const handleSendToSlack = async () => {
    if (!currentMealPlan || !user?.slack_channel) {
      showNotification('error', 'No meal plan or Slack channel configured');
      return;
    }

    setIsSendingToSlack(true);
    try {
      await trpc.sendToSlack.mutate({ meal_plan_id: currentMealPlan.id });
      showNotification('success', `Meal plan sent to ${user.slack_channel} successfully!`);
    } catch (error) {
      console.error('Failed to send to Slack:', error);
      showNotification('error', 'Failed to send meal plan to Slack');
    } finally {
      setIsSendingToSlack(false);
    }
  };

  // Update user settings
  const handleUpdateSettings = async () => {
    if (!user) return;

    try {
      const updatedUser = await trpc.updateUserSettings.mutate({
        id: user.id,
        slack_channel: slackChannel || null,
        auto_send_slack: autoSendSlack
      });
      setUser(updatedUser);
      showNotification('success', 'Settings updated successfully!');
    } catch (error) {
      console.error('Failed to update settings:', error);
      showNotification('error', 'Failed to update settings');
    }
  };

  // Load initial data when user connects
  useEffect(() => {
    if (user) {
      loadInventory(user.id);
      loadMealPlan(user.id);
    }
  }, [user, loadInventory, loadMealPlan]);

  // Auto-connect with saved household ID on app load
  useEffect(() => {
    const savedHouseholdId = localStorage.getItem('grocery-planner-household-id');
    if (savedHouseholdId) {
      setHouseholdId(savedHouseholdId);
      loadUser(savedHouseholdId);
    }
  }, [loadUser]);

  // Save household ID to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('grocery-planner-household-id', user.household_id);
    }
  }, [user]);

  const getMealIcon = (mealType: string) => {
    switch (mealType) {
      case 'breakfast': return <Coffee className="h-4 w-4" />;
      case 'lunch': return <UtensilsCrossed className="h-4 w-4" />;
      case 'dinner': return <Moon className="h-4 w-4" />;
      default: return <UtensilsCrossed className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🍽️ Grocery Meal Planner
          </h1>
          <p className="text-gray-600">
            Manage your inventory, plan your meals, and share with your team
          </p>
        </div>

        {/* Notification Toast */}
        {notification && (
          <Alert className={`mb-6 ${notification.type === 'success' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
            {notification.type === 'success' ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription className={notification.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {notification.message}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setup">🏠 Setup</TabsTrigger>
            <TabsTrigger value="inventory" disabled={!user}>📦 Inventory</TabsTrigger>
            <TabsTrigger value="meal-plan" disabled={!user}>🍽️ Meal Plan</TabsTrigger>
            <TabsTrigger value="settings" disabled={!user}>⚙️ Settings</TabsTrigger>
          </TabsList>

          {/* Setup Tab */}
          <TabsContent value="setup">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  🏠 Connect Your Household
                </CardTitle>
                <CardDescription>
                  Connect to your Lakebase inventory system to get started
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleConnect} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="household-id">Household ID</Label>
                      <Input
                        id="household-id"
                        placeholder="Enter your household ID"
                        value={householdId}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHouseholdId(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inventory-endpoint">Inventory Endpoint URL</Label>
                      <Input
                        id="inventory-endpoint"
                        type="url"
                        placeholder="https://api.lakebase.com/inventory"
                        value={inventoryEndpoint}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInventoryEndpoint(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="slack-channel">Slack Channel (Optional)</Label>
                    <Input
                      id="slack-channel"
                      placeholder="#meal-planning"
                      value={slackChannel}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlackChannel(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto-slack"
                      checked={autoSendSlack}
                      onCheckedChange={setAutoSendSlack}
                    />
                    <Label htmlFor="auto-slack">Auto-send meal plans to Slack</Label>
                  </div>

                  <Button type="submit" disabled={isConnecting} className="w-full">
                    {isConnecting ? 'Connecting...' : 'Connect Household'}
                  </Button>
                </form>

                {user && (
                  <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
                      <CheckCircle className="h-4 w-4" />
                      Connected Successfully!
                    </div>
                    <p className="text-green-700 text-sm">
                      Household: {user.household_id} | 
                      Connected on: {user.created_at.toLocaleDateString()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      📦 Your Inventory
                    </CardTitle>
                    <CardDescription>
                      Manage and track your food items
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleRefreshInventory}
                    disabled={isRefreshing}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingInventory ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : inventory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No inventory items found.</p>
                    <p className="text-sm">Try refreshing to load items from your endpoint.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.map((item: InventoryItem) => (
                        <TableRow key={item.id} className={item.is_expiring_soon ? 'bg-red-50' : ''}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>
                            {item.expiry_date ? item.expiry_date.toLocaleDateString() : 'No expiry'}
                          </TableCell>
                          <TableCell>
                            {item.is_expiring_soon ? (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Expiring Soon
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Fresh</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Meal Plan Tab */}
          <TabsContent value="meal-plan">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        🍽️ Weekly Meal Plan
                      </CardTitle>
                      <CardDescription>
                        AI-generated meal plan based on your inventory
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleGenerateMealPlan}
                        disabled={isGeneratingMealPlan}
                      >
                        <Calendar className={`h-4 w-4 mr-2 ${isGeneratingMealPlan ? 'animate-spin' : ''}`} />
                        {isGeneratingMealPlan ? 'Generating...' : 'Generate New Plan'}
                      </Button>
                      {currentMealPlan && user?.slack_channel && (
                        <Button
                          onClick={handleSendToSlack}
                          disabled={isSendingToSlack}
                          variant="outline"
                        >
                          <Slack className={`h-4 w-4 mr-2 ${isSendingToSlack ? 'animate-spin' : ''}`} />
                          {isSendingToSlack ? 'Sending...' : 'Send to Slack'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isGeneratingMealPlan ? (
                    <div className="space-y-3">
                      <Skeleton className="h-6 w-1/3" />
                      {[...Array(7)].map((_, i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-5 w-1/4" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : !parsedMealPlan ? (
                    <div className="text-center py-8 text-gray-500">
                      <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No meal plan generated yet.</p>
                      <p className="text-sm">Click "Generate New Plan" to create your weekly meal plan.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="text-center">
                        <h3 className="text-lg font-semibold">
                          Week of {formatDate(parsedMealPlan.week_start_date)}
                        </h3>
                        {currentMealPlan && (
                          <p className="text-sm text-gray-500 mt-1">
                            Generated on {currentMealPlan.created_at.toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      <div className="grid gap-4">
                        {parsedMealPlan.daily_meals.map((day, index) => (
                          <Card key={index} className="border-l-4 border-l-green-500">
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">
                                {formatDate(day.date)}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {(['breakfast', 'lunch', 'dinner'] as const).map((mealType) => (
                                  <div key={mealType} className="space-y-2">
                                    <div className="flex items-center gap-2 font-medium text-sm text-gray-700">
                                      {getMealIcon(mealType)}
                                      {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-md">
                                      <h4 className="font-medium text-sm mb-1">
                                        {day[mealType].title}
                                      </h4>
                                      <p className="text-xs text-gray-600">
                                        {day[mealType].ingredients_summary}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Shopping Gaps */}
              {shoppingGaps.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5" />
                      Shopping List
                    </CardTitle>
                    <CardDescription>
                      Items you need to buy to complete this meal plan
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {shoppingGaps.map((gap, index) => (
                        <div key={index} className="flex justify-between items-start p-3 bg-orange-50 rounded-md border border-orange-200">
                          <div className="flex-1">
                            <div className="font-medium text-orange-900">
                              {gap.ingredient}
                            </div>
                            <div className="text-sm text-orange-700">
                              Quantity needed: {gap.quantity_needed}
                            </div>
                            <div className="text-xs text-orange-600 mt-1">
                              Used in: {gap.used_for_meals.join(', ')}
                            </div>
                          </div>
                          <Badge variant="outline" className="border-orange-300 text-orange-700">
                            Missing
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  ⚙️ Settings
                </CardTitle>
                <CardDescription>
                  Manage your Slack integration and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-slack-channel">Slack Channel</Label>
                    <Input
                      id="settings-slack-channel"
                      placeholder="#meal-planning"
                      value={slackChannel}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlackChannel(e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      Channel where meal plans will be sent (leave empty to disable)
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="settings-auto-slack"
                      checked={autoSendSlack}
                      onCheckedChange={setAutoSendSlack}
                    />
                    <Label htmlFor="settings-auto-slack">
                      Automatically send new meal plans to Slack
                    </Label>
                  </div>

                  <Separator />

                  <Button onClick={handleUpdateSettings} className="w-full">
                    Save Settings
                  </Button>
                </div>

                {user && (
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                    <h4 className="font-medium text-gray-800">Connection Info</h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><strong>Household ID:</strong> {user.household_id}</p>
                      <p><strong>Inventory Endpoint:</strong> {user.inventory_endpoint}</p>
                      <p><strong>Connected:</strong> {user.created_at.toLocaleDateString()}</p>
                      <p><strong>Last Updated:</strong> {user.updated_at.toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;