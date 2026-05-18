import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LayoutGrid, Search, ChartBar as BarChart3, Settings, Users, LogOut, Menu, X, Snowflake, Package2, ChevronLeft, ChevronRight } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
  { label: 'Freezers', href: '/freezers', icon: Snowflake },
  { label: 'Cajas', href: '/boxes', icon: Package2 },
  { label: 'Búsqueda', href: '/search', icon: Search },
  { label: 'Informes', href: '/reports', icon: BarChart3 },
  { label: 'Ajustes', href: '/settings', icon: Settings },
  { label: 'Usuarios', href: '/users', icon: Users },
];

function getActiveItem(pathname: string) {
  // Box detail pages should highlight "Cajas"
  if (pathname.includes('/box/')) return '/boxes';
  for (const item of menuItems) {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
      return item.href;
    }
  }
  return null;
}

// SVG Logo
function CryoVaultLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="9" fill="url(#cv_grad)" />
      {/* Snowflake arms */}
      <line x1="18" y1="7" x2="18" y2="29" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="7" y1="18" x2="29" y2="18" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="10.5" y1="10.5" x2="25.5" y2="25.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="25.5" y1="10.5" x2="10.5" y2="25.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      {/* Center dot */}
      <circle cx="18" cy="18" r="2.5" fill="white" />
      {/* Arm tips */}
      <circle cx="18" cy="7.5" r="1.5" fill="white" />
      <circle cx="18" cy="28.5" r="1.5" fill="white" />
      <circle cx="7.5" cy="18" r="1.5" fill="white" />
      <circle cx="28.5" cy="18" r="1.5" fill="white" />
      <defs>
        <linearGradient id="cv_grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeHref = getActiveItem(location.pathname);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const activeLabel = menuItems.find((i) => i.href === activeHref)?.label || 'CryoVault';

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      {/* ── DESKTOP SIDEBAR ── */}
      <aside
        className={`
          hidden lg:flex flex-shrink-0 flex-col
          ${sidebarOpen ? 'w-60' : 'w-[72px]'}
          bg-white border-r border-gray-200 transition-all duration-300
        `}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-100 flex items-center gap-3 min-h-[64px]">
          <Link to="/dashboard" className="flex items-center gap-3 min-w-0">
            <CryoVaultLogo size={36} />
            {sidebarOpen && (
              <span className="font-bold text-gray-900 text-lg tracking-tight truncate">CryoVault</span>
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {menuItems.map(({ label, href, icon: Icon }) => {
            const isActive = activeHref === href;
            return (
              <Link
                key={href}
                to={href}
                title={!sidebarOpen ? label : undefined}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600 pl-2'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-l-4 border-transparent pl-2'
                  }
                `}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                {sidebarOpen && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-2 py-4 border-t border-gray-100 space-y-2">
          {sidebarOpen && (
            <div className="px-3 py-2 rounded-lg bg-gray-50">
              <p className="text-xs font-semibold text-gray-700 truncate">{user?.full_name || user?.email}</p>
              <p className="text-xs text-gray-400 capitalize truncate">{user?.role}</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500
              hover:bg-red-50 hover:text-red-600 transition-colors
              ${!sidebarOpen ? 'justify-center' : ''}
            `}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span>Salir</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute bottom-24 -right-3 z-10 bg-white border border-gray-200 shadow-sm p-1 rounded-full text-gray-400 hover:text-gray-600 transition-colors hidden lg:flex items-center justify-center"
          style={{ position: 'relative', alignSelf: 'flex-end', margin: '0 -12px 8px auto' }}
        >
          {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-4 lg:px-8 py-3.5 flex items-center justify-between flex-shrink-0 h-16">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            {/* Desktop: breadcrumb title */}
            <h1 className="text-base font-semibold text-gray-800 hidden lg:block">{activeLabel}</h1>
            {/* Mobile: logo */}
            <div className="flex items-center gap-2 lg:hidden">
              <CryoVaultLogo size={28} />
              <span className="font-bold text-gray-900 text-sm">CryoVault</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-xs text-gray-400 font-medium capitalize bg-gray-100 px-2.5 py-1 rounded-full">
              {user?.role}
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-gray-50 pb-16 lg:pb-0">
          {children}
        </main>
      </div>

      {/* ── MOBILE BOTTOM TAB BAR ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex items-center justify-around px-1 safe-area-inset-bottom">
        {menuItems.slice(0, 5).map(({ label, href, icon: Icon }) => {
          const isActive = activeHref === href;
          return (
            <Link
              key={href}
              to={href}
              className={`flex flex-col items-center gap-0.5 py-2 px-2 min-w-[52px] rounded-lg transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
        {/* "More" opens mobile drawer */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2 px-2 min-w-[52px] rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">Más</span>
        </button>
      </nav>

      {/* ── MOBILE SLIDE-IN DRAWER ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white flex flex-col shadow-xl">
            <div className="px-4 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CryoVaultLogo size={32} />
                <span className="font-bold text-gray-900">CryoVault</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
              {menuItems.map(({ label, href, icon: Icon }) => {
                const isActive = activeHref === href;
                return (
                  <Link
                    key={href}
                    to={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all
                      ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}
                    `}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="px-4 py-4 border-t border-gray-100">
              <div className="mb-3 p-3 rounded-lg bg-gray-50">
                <p className="text-sm font-medium text-gray-800">{user?.full_name || user?.email}</p>
                <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
