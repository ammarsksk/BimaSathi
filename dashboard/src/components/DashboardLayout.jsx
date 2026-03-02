import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
    LayoutDashboard, FileText, BarChart3, LogOut, Bell,
    Search, ChevronRight, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './DashboardLayout.css'

const NAV_ITEMS = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/claims', label: 'Claims Queue', icon: FileText },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
]

export default function DashboardLayout() {
    const [collapsed, setCollapsed] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)
    const location = useLocation()
    const navigate = useNavigate()
    const { user, logout } = useAuth()

    const handleLogout = () => { logout(); navigate('/') }

    const pageTitle = NAV_ITEMS.find(n => location.pathname.startsWith(n.path))?.label
        || (location.pathname.includes('/claims/') ? 'Claim Detail' : 'Dashboard')

    return (
        <div className={`dash-layout ${collapsed ? 'collapsed' : ''}`}>
            {/* Sidebar */}
            <aside className={`dash-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-header">
                    <span className="sidebar-logo-icon">🌾</span>
                    {!collapsed && <span className="sidebar-logo-text gradient-text">BimaSathi</span>}
                    <button className="sidebar-collapse-btn desktop-only" onClick={() => setCollapsed(!collapsed)}>
                        <ChevronRight size={16} style={{ transform: collapsed ? 'none' : 'rotate(180deg)' }} />
                    </button>
                    <button className="sidebar-close-btn mobile-only" onClick={() => setMobileOpen(false)}>
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {NAV_ITEMS.map(item => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            onClick={() => setMobileOpen(false)}
                        >
                            <item.icon size={20} />
                            {!collapsed && <span>{item.label}</span>}
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
                        {!collapsed && <span>Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Overlay for mobile */}
            {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

            {/* Main content */}
            <main className="dash-main">
                <header className="dash-topbar">
                    <div className="topbar-left">
                        <button className="topbar-menu mobile-only" onClick={() => setMobileOpen(true)}>
                            <Menu size={22} />
                        </button>
                        <h1 className="topbar-title">{pageTitle}</h1>
                    </div>
                    <div className="topbar-right">
                        <div className="topbar-search">
                            <Search size={16} />
                            <input type="text" placeholder="Search claims…" className="topbar-search-input" />
                        </div>
                        <button className="topbar-bell">
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
