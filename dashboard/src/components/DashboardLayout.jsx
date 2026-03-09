import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
    BarChart3,
    Bell,
    ChevronRight,
    FileText,
    LayoutDashboard,
    LogOut,
    Menu,
    Search,
    Users,
    X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import './DashboardLayout.css'

const NAV_ITEMS = [
    { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { path: '/access', labelKey: 'nav.access', icon: Users },
    { path: '/claims', labelKey: 'nav.claims', icon: FileText },
    { path: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
]

export default function DashboardLayout() {
    const [collapsed, setCollapsed] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)
    const location = useLocation()
    const navigate = useNavigate()
    const { user, logout } = useAuth()
    const { language, languages, setLanguage, t } = useLanguage()

    const pageTitleKey = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path))?.labelKey
        || (location.pathname.includes('/claims/') ? 'nav.workspace' : 'nav.dashboard')

    function handleLogout() {
        logout()
        navigate('/')
    }

    return (
        <div className={`dash-layout ${collapsed ? 'collapsed' : ''}`}>
            <aside className={`dash-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-header">
                    <span className="sidebar-logo-icon">BS</span>
                    {!collapsed && <span className="sidebar-logo-text gradient-text">BimaSathi</span>}
                    <button className="sidebar-collapse-btn desktop-only" onClick={() => setCollapsed((current) => !current)}>
                        <ChevronRight size={16} style={{ transform: collapsed ? 'none' : 'rotate(180deg)' }} />
                    </button>
                    <button className="sidebar-close-btn mobile-only" onClick={() => setMobileOpen(false)}>
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            onClick={() => setMobileOpen(false)}
                        >
                            <item.icon size={20} />
                            {!collapsed && <span>{t(item.labelKey)}</span>}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-user">
                        <div className="sidebar-avatar">{(user?.name || 'OP').slice(0, 2).toUpperCase()}</div>
                        {!collapsed && (
                            <div className="sidebar-user-info">
                                <span className="sidebar-user-name">{user?.name || 'Operator'}</span>
                                <span className="sidebar-user-role">{user?.role === 'operator' ? 'CSC Agent' : user?.role || 'Agent'}</span>
                            </div>
                        )}
                    </div>
                    <button onClick={handleLogout} className="sidebar-link logout-link">
                        <LogOut size={20} />
                        {!collapsed && <span>{t('common.logout')}</span>}
                    </button>
                </div>
            </aside>

            {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

            <main className="dash-main">
                <header className="dash-topbar">
                    <div className="topbar-left">
                        <button className="topbar-menu mobile-only" onClick={() => setMobileOpen(true)}>
                            <Menu size={22} />
                        </button>
                        <h1 className="topbar-title">{t(pageTitleKey)}</h1>
                    </div>
                    <div className="topbar-right">
                        <div className="topbar-search">
                            <Search size={16} />
                            <input type="text" placeholder={t('common.search_placeholder')} className="topbar-search-input" />
                        </div>
                        <label className="topbar-language">
                            <span>{t('common.change_language')}</span>
                            <select className="select-field" value={language} onChange={(event) => setLanguage(event.target.value)}>
                                {languages.map((item) => (
                                    <option key={item.code} value={item.code}>{item.label}</option>
                                ))}
                            </select>
                        </label>
                        <button className="topbar-bell" aria-label="notifications">
                            <Bell size={20} />
                            <span className="topbar-bell-dot" />
                        </button>
                    </div>
                </header>

                <div className="dash-content">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
