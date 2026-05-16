import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Beaker, Search, ChartBar as BarChart3, Settings, Users, LogOut, Menu, X, Snowflake } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
  { label: 'Freezers', href: '/freezers', icon: Snowflake },
  { label: 'Samples', href: '/samples', icon: Beaker },
  { label: 'Search', href: '/search', icon: Search },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Users', href: '/users', icon: Users },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="h-screen flex bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <div
        className={`relative flex-shrink-0 ${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-slate-900 border-r border-slate-800 transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-slate-800">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white font-bold">CV</span>
            </div>
            {sidebarOpen && (
              <span className="text-white font-bold truncate">CryoVault</span>
            )}
          </Link>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
          {menuItems.map(({ label, href, icon: Icon }) => {
            const isActive = location.pathname === href || location.pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                to={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
                title={!sidebarOpen ? label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-6 border-t border-slate-800 space-y-3">
          {sidebarOpen && (
            <div className="px-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Usuario</p>
              <p className="text-sm font-medium text-white truncate">{user?.full_name || user?.email}</p>
              <p className="text-xs text-slate-400 truncate">{user?.role}</p>
            </div>
          )}
          <Button
            onClick={handleSignOut}
            variant="outline"
            className={`w-full text-slate-300 border-slate-700 hover:bg-slate-800 ${!sidebarOpen ? 'px-2' : ''}`}
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && <span>Salir</span>}
          </Button>
        </div>

        {/* Toggle Button - positioned relative to sidebar */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute bottom-24 -right-3 z-10 bg-slate-800 border border-slate-700 p-1 rounded-full hover:bg-slate-700 text-slate-400"
        >
          {sidebarOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 px-8 py-4 flex items-center justify-between flex-shrink-0">
          <h1 className="text-xl font-bold text-white">
            {menuItems.find(
              (item) =>
                location.pathname === item.href ||
                location.pathname.startsWith(item.href + '/')
            )?.label || 'CryoVault'}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="bg-slate-950">{children}</div>
        </div>
      </div>
    </div>
  );
}
