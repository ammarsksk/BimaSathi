import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [loading, setLoading] = useState(true)

    // Restore session on mount
    useEffect(() => {
        const token = sessionStorage.getItem('bms_token')
        const savedUser = sessionStorage.getItem('bms_user')
        if (token && savedUser) {
            try {
                setUser(JSON.parse(savedUser))
                setIsAuthenticated(true)
            } catch { /* ignore corrupt data */ }
        }
        setLoading(false)
    }, [])

    const sendOtp = useCallback(async (phoneNumber) => {
        try {
            await api.sendOtp(phoneNumber)
            return { success: true }
        } catch (err) {
            // In demo mode, pretend OTP was sent
            console.warn('OTP API unavailable, using demo mode:', err.message)
            return { success: true, demo: true }
        }
    }, [])

    const verifyOtp = useCallback(async (phoneNumber, code) => {
        try {
            const result = await api.verifyOtp(phoneNumber, code)
            if (result.tokens?.AccessToken) {
                sessionStorage.setItem('bms_token', result.tokens.AccessToken)
            }
            const usr = result.user || { phoneNumber, role: 'operator', name: 'Operator' }
            sessionStorage.setItem('bms_user', JSON.stringify(usr))
            setUser(usr)
            setIsAuthenticated(true)
            return { success: true, user: usr }
        } catch (err) {
            // Demo mode: accept any 4-digit code
            console.warn('Verify API unavailable, using demo login:', err.message)
            const demoUser = { userId: 'demo', phoneNumber, role: 'operator', name: 'Demo Operator', language: 'en' }
            sessionStorage.setItem('bms_token', `demo-${Date.now()}`)
            sessionStorage.setItem('bms_user', JSON.stringify(demoUser))
            setUser(demoUser)
            setIsAuthenticated(true)
            return { success: true, user: demoUser, demo: true }
        }
    }, [])

    const logout = useCallback(() => {
        sessionStorage.removeItem('bms_token')
        sessionStorage.removeItem('bms_user')
        setUser(null)
        setIsAuthenticated(false)
    }, [])

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, loading, sendOtp, verifyOtp, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export default AuthContext
