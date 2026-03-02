import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Phone, ArrowRight, Shield, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export default function Login() {
    const navigate = useNavigate()
    const { sendOtp, verifyOtp } = useAuth()
    const [step, setStep] = useState('phone') // phone | otp | verifying
    const [phone, setPhone] = useState('')
    const [otp, setOtp] = useState('')
    const [error, setError] = useState('')

    const handleSendOTP = async (e) => {
        e.preventDefault()
        if (phone.length < 10) { setError('Enter a valid 10-digit phone number'); return }
        setError('')
        try {
            await sendOtp(phone)
            setStep('otp')
        } catch (err) {
            setError(err.message || 'Failed to send OTP')
        }
    }

    const handleVerifyOTP = async (e) => {
        e.preventDefault()
        if (otp.length < 4) { setError('Enter the 4-digit OTP'); return }
        setError('')
        setStep('verifying')
        try {
            const result = await verifyOtp(phone, otp)
            if (result.success) {
                navigate('/dashboard')
            }
        } catch (err) {
            setError(err.message || 'Verification failed')
            setStep('otp')
        }
    }

    return (
        <div className="login-page">
            <div className="login-bg">
                <div className="login-orb login-orb-1" />
                <div className="login-orb login-orb-2" />
            </div>

            <div className="login-container">
                <Link to="/" className="login-back">← Back to Home</Link>

                <div className="login-card glass-card">
                    <div className="login-logo">
                        <span className="logo-icon">🌾</span>
                        <span className="logo-text" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--primary)' }}>BimaSathi</span>
                    </div>
                    <h1 className="login-title">Operator Login</h1>
                    <p className="login-desc">Sign in with your registered phone number to access the claims dashboard.</p>

                    {step === 'phone' && (
                        <form onSubmit={handleSendOTP} className="login-form">
                            <div className="input-group">
                                <label>Phone Number</label>
                                <div className="input-with-icon">
                                    <Phone size={18} className="input-icon" />
                                    <input
                                        type="tel"
                                        className="input-field"
                                        placeholder="+91 98765 43210"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            {error && <p className="login-error">{error}</p>}
                            <button type="submit" className="btn btn-primary btn-lg login-btn">
                                Send OTP <ArrowRight size={18} />
                            </button>
                        </form>
                    )}

                    {step === 'otp' && (
                        <form onSubmit={handleVerifyOTP} className="login-form">
                            <p className="otp-sent">OTP sent to <strong>{phone}</strong></p>
                            <div className="input-group">
                                <label>Enter OTP</label>
                                <div className="otp-inputs">
                                    {[0, 1, 2, 3].map(i => (
                                        <input
                                            key={i}
                                            type="text"
                                            maxLength={1}
                                            className="otp-box"
                                            value={otp[i] || ''}
                                            autoFocus={i === 0}
                                            onChange={(e) => {
                                                const v = e.target.value.replace(/[^0-9]/g, '')
                                                const newOtp = otp.split('')
                                                newOtp[i] = v
                                                setOtp(newOtp.join(''))
                                                if (v && e.target.nextElementSibling) e.target.nextElementSibling.focus()
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Backspace' && !otp[i] && e.target.previousElementSibling) {
                                                    e.target.previousElementSibling.focus()
                                                }
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                            {error && <p className="login-error">{error}</p>}
                            <button type="submit" className="btn btn-primary btn-lg login-btn">
                                <Shield size={18} /> Verify & Login
                            </button>
                            <button type="button" className="login-resend" onClick={() => setStep('phone')}>
                                Change number / Resend OTP
                            </button>
                        </form>
                    )}

                    {step === 'verifying' && (
                        <div className="login-verifying">
                            <Loader2 size={40} className="spin" />
                            <p>Verifying OTP…</p>
                        </div>
                    )}

                    <div className="login-footer">
                        <Shield size={14} />
                        <span>Secured by AWS Cognito. OTP verified via Twilio.</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
