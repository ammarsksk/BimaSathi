import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider, useLanguage } from './context/LanguageContext'
import DashboardLayout from './components/DashboardLayout'
import Analytics from './pages/Analytics'
import ClaimDetail from './pages/ClaimDetail'
import ClaimsQueue from './pages/ClaimsQueue'
import Dashboard from './pages/Dashboard'
import FarmerAccess from './pages/FarmerAccess'
import Landing from './pages/Landing'
import Login from './pages/Login'

function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth()
    const { t } = useLanguage()

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-muted)' }}>
                {t('common.loading')}
            </div>
        )
    }

    return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
    return (
        <BrowserRouter>
            <LanguageProvider>
                <AuthProvider>
                    <Routes>
                        <Route path="/" element={<Landing />} />
                        <Route path="/login" element={<Login />} />
                        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/access" element={<FarmerAccess />} />
                            <Route path="/claims" element={<ClaimsQueue />} />
                            <Route path="/claims/:id" element={<ClaimDetail />} />
                            <Route path="/analytics" element={<Analytics />} />
                        </Route>
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </AuthProvider>
            </LanguageProvider>
        </BrowserRouter>
    )
}
