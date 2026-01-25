"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  ShoppingCart,
  Download,
  Tag,
  ClipboardList,
  Briefcase,
  CreditCard,
  FileText,
  User,
  Building2,
  Settings,
  LogOut,
  Moon,
  Bell,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Percent,
  Truck,
  Package,
  Users,
  BarChart3,
  CheckCircle,
  Clock,
  ShoppingBag,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<any | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUser = sessionStorage.getItem("user");
      const storedEmail = sessionStorage.getItem("userEmail");

      if (!storedUser || !storedEmail) {
        router.push("/");
        return;
      }

      try {
        setUser(JSON.parse(storedUser));
        setUserEmail(storedEmail);
        setLoading(false);
      } catch (error) {
        console.error("Error parsing user data:", error);
        router.push("/");
      }
    }
  }, [router]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("userEmail");
      localStorage.removeItem("rememberMe");
      localStorage.removeItem("userEmail");
    }
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  const menuItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "orders", icon: ShoppingCart, label: "Orders" },
    { id: "downloads", icon: Download, label: "Downloads" },
    { id: "offers", icon: Tag, label: "Offers" },
    { id: "shopping", icon: ClipboardList, label: "Shopping lists" },
    { id: "services", icon: Briefcase, label: "Services" },
    { id: "transactions", icon: CreditCard, label: "Transactions" },
    { id: "contracts", icon: FileText, label: "Contracts" },
    { id: "account", icon: User, label: "Account" },
    { id: "businesses", icon: Building2, label: "Businesses" },
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  const statsCards = [
    {
      icon: ShoppingBag,
      label: "Active Orders",
      value: "13",
      change: "+12%",
      positive: true,
      bgColor: "bg-green-50",
      iconColor: "text-green-600",
    },
    {
      icon: CreditCard,
      label: "Monthly Spend",
      value: "12,230€",
      change: "-5%",
      positive: false,
      bgColor: "bg-orange-50",
      iconColor: "text-orange-600",
    },
    {
      icon: BarChart3,
      label: "Monthly Profit",
      value: "8,230€",
      change: "+23%",
      positive: true,
      bgColor: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: Briefcase,
      label: "Active Services",
      value: "7",
      change: "+3",
      positive: true,
      bgColor: "bg-green-50",
      iconColor: "text-green-600",
    },
  ];

  const quickServices = [
    {
      title: "Inventory Management",
      description: "Track stock levels, automate reordering, and manage supplier relationships efficiently",
      services: "6 Services",
      image: "/images/inventory.jpg",
    },
    {
      title: "Staff Management",
      description: "Schedule shifts, track performance, and manage payroll with integrated tools",
      services: "6 Services",
      image: "/images/staff.jpg",
    },
    {
      title: "Marketing & CRM",
      description: "Customer relationship management and automated marketing campaigns",
      services: "6 Services",
      image: "/images/marketing.jpg",
    },
    {
      title: "Delivery & Logistics",
      description: "Optimize delivery routes, manage drivers, and track order fulfillment",
      services: "6 Services",
      image: "/images/delivery.jpg",
    },
  ];

  const activeServices = [
    { name: "Premium Catering Package", expires: "April 30, 2026", price: "1,200€" },
    { name: "Premium Catering Package", expires: "April 30, 2026", price: "1,200€" },
    { name: "Premium Catering Package", expires: "April 30, 2026", price: "1,200€" },
    { name: "Premium Catering Package", expires: "April 30, 2026", price: "1,200€" },
    { name: "Premium Catering Package", expires: "April 30, 2026", price: "1,200€" },
  ];

  const upcomingPayments = [
    { name: "Monthly Service Fee", due: "April 30, 2026", amount: "1,200€" },
    { name: "Premium Catering Package", expires: "April 30, 2026", amount: "1,200€" },
    { name: "Premium Catering Package", expires: "April 30, 2026", amount: "1,200€" },
    { name: "Premium Catering Package", expires: "April 30, 2026", amount: "1,200€" },
    { name: "Premium Catering Package", expires: "April 30, 2026", amount: "1,200€" },
  ];

  const recentActivity = [
    { type: "approved", title: "Contract Approved", subtitle: "Premium Catering Service", time: "2 hours ago" },
    { type: "completed", title: "Order Completed", subtitle: "Drink Orders", time: "3 days ago" },
    { type: "approved", title: "Contract Approved", subtitle: "Premium Catering Service", time: "2 hours ago" },
    { type: "completed", title: "Order Completed", subtitle: "Drink Orders", time: "3 days ago" },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">CC</span>
            </div>
            <span className="font-semibold text-gray-800">Culinary Collective</span>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveMenu(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    activeMenu === item.id
                      ? "bg-green-50 text-green-600"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
              <p className="text-sm text-gray-500">Welcome back! Here&apos;s what&apos;s happening with your account today.</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <Moon className="w-5 h-5 text-gray-600" />
              </button>
              <LanguageSwitcher />
              <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors relative">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              
              {/* Profile Dropdown */}
              <div className="relative" ref={profileDropdownRef}>
                <button 
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center hover:ring-2 hover:ring-green-300 transition-all"
                >
                  <User className="w-5 h-5 text-green-600" />
                </button>
                
                {profileDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[180px] z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">{userEmail}</p>
                    </div>
                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        // Navigate to account settings
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      <span>Account</span>
                    </button>
                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        // Navigate to settings
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </button>
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsCards.map((stat, index) => (
              <Card key={index} className="border-gray-200">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                      <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
                    </div>
                    <span className={`text-sm font-medium ${stat.positive ? "text-green-600" : "text-red-600"}`}>
                      {stat.change}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-4">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Offers Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Offers</h2>
              <button className="text-sm text-green-600 hover:underline">View all offers</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Offer Card 1 */}
              <Card className="border-gray-200 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                        <Percent className="w-6 h-6 text-orange-600" />
                      </div>
                      <div>
                        <span className="inline-block px-2 py-1 bg-green-500 text-white text-xs font-medium rounded mb-2">
                          30% OFF
                        </span>
                        <h3 className="font-semibold text-gray-900">Premium Ingredients Package</h3>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-4">
                    Get 30% off on premium quality ingredients for your restaurant. Limited time offer for Culinary platform members.
                  </p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Valid until Dec 31, 2026
                    </span>
                    <Button className="bg-green-600 hover:bg-green-700 text-white">
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Offer Card 2 */}
              <Card className="border-gray-200 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Truck className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <span className="inline-block px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded mb-2">
                          FREE
                        </span>
                        <h3 className="font-semibold text-gray-900">Free Delivery Service</h3>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-4">
                    Enjoy free delivery on all orders above 500€. Upgrade your supply chain efficiency with our logistics partners.
                  </p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Valid until Dec 31, 2026
                    </span>
                    <Button className="bg-green-600 hover:bg-green-700 text-white">
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Revenue Status & Shop Now */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Revenue Status */}
            <Card className="border-gray-200 lg:col-span-2">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-semibold text-gray-900">Revenue Status</h3>
                    <p className="text-sm text-gray-500">Monthly expenses breakdown</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded">Month</button>
                    <button className="px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded">Quarter</button>
                    <button className="px-3 py-1 text-sm bg-green-500 text-white rounded">Year</button>
                  </div>
                </div>
                {/* Simple Chart Placeholder */}
                <div className="h-48 flex items-end justify-between gap-2 px-4">
                  {[1000, 1500, 2000, 3000, 5000, 7500, 6000, 4000].map((value, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <div
                        className="w-full bg-gradient-to-t from-green-200 to-green-400 rounded-t"
                        style={{ height: `${(value / 7500) * 150}px` }}
                      ></div>
                      <span className="text-xs text-gray-500">
                        {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"][i]}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-8 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                    <span className="text-sm text-gray-500">Expense: 4,950 €</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                    <span className="text-sm text-gray-500">Revenue: 3,750 €</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Shop Now */}
            <Card className="border-gray-200 bg-gray-900 text-white">
              <CardContent className="p-6 flex flex-col items-center justify-center h-full">
                <h3 className="text-2xl font-bold mb-4">Shop Now</h3>
                <div className="w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mb-4">
                  <ShoppingCart className="w-12 h-12 text-white" />
                </div>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white mt-4">
                  Browse Products
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Quick Access Services */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Quick Access Services</h2>
              <button className="text-sm text-green-600 hover:underline">View all services</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {quickServices.map((service, index) => (
                <Card key={index} className="border-gray-200 overflow-hidden group hover:shadow-lg transition-shadow">
                  <div className="h-32 bg-gradient-to-br from-gray-200 to-gray-300 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                  </div>
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">{service.title}</h4>
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{service.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-green-600 font-medium">{service.services}</span>
                      <ChevronRight className="w-4 h-4 text-orange-500 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Bottom Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Services */}
            <Card className="border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Active Services</h3>
                  <button className="text-sm text-green-600 hover:underline">View all</button>
                </div>
                <ul className="space-y-4">
                  {activeServices.map((service, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Package className="w-4 h-4 text-orange-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{service.name}</p>
                        <p className="text-xs text-gray-500">Expires: {service.expires}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{service.price}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Upcoming Payments */}
            <Card className="border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Upcoming Payments</h3>
                  <button className="text-sm text-green-600 hover:underline">View all</button>
                </div>
                <ul className="space-y-4">
                  {upcomingPayments.map((payment, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{payment.name}</p>
                        <p className="text-xs text-gray-500">Due: {payment.due}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{payment.amount}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Recent Activity</h3>
                  <button className="text-sm text-green-600 hover:underline">View all</button>
                </div>
                <ul className="space-y-4">
                  {recentActivity.map((activity, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        activity.type === "approved" ? "bg-orange-100" : "bg-blue-100"
                      }`}>
                        {activity.type === "approved" ? (
                          <CheckCircle className="w-4 h-4 text-orange-600" />
                        ) : (
                          <Package className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                        <p className="text-xs text-gray-500">{activity.subtitle}</p>
                      </div>
                      <span className="text-xs text-gray-400">{activity.time}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
