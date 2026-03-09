import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import api from '../api/client'
import { normalizeOperatorUser } from '../utils/session'

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
                const normalizedUser = normalizeOperatorUser(JSON.parse(savedUser), token)
                sessionStorage.setItem('bms_user', JSON.stringify(normalizedUser))
                setUser(normalizedUser)
                setIsAuthenticated(true)
            } catch { /* ignore corrupt data */ }
        }
        setLoading(false)
    }, [])

    const sendOtp = useCallback(async (phoneNumber) => {
        try {
            return await api.sendOtp(phoneNumber)
        } catch (err) {
            console.error('OTP send failed:', err.message)
            throw err
        }
    }, [])

    const verifyOtp = useCallback(async (phoneNumber, code) => {
        const result = await api.verifyOtp(phoneNumber, code)
        if (result.tokens?.AccessToken) {
            sessionStorage.setItem('bms_token', result.tokens.AccessToken)
        }
        const usr = normalizeOperatorUser(
            result.user || { phoneNumber, role: 'operator', name: 'Operator' },
            result.tokens?.AccessToken || ''
        )
        sessionStorage.setItem('bms_user', JSON.stringify(usr))
        setUser(usr)
        setIsAuthenticated(true)
        return { success: true, user: usr }
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
