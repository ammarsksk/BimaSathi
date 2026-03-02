import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import DashboardLayout from './components/DashboardLayout'
import Dashboard from './pages/Dashboard'
import ClaimsQueue from './pages/ClaimsQueue'
import ClaimDetail from './pages/ClaimDetail'
import Analytics from './pages/Analytics'

function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth()
    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-muted)' }}>Loading…</div>
    return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/login" element={<Login />} />
                    <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/claims" element={<ClaimsQueue />} />
                        <Route path="/claims/:id" element={<ClaimDetail />} />
                        <Route path="/analytics" element={<Analytics />} />
                    </Route>
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}
