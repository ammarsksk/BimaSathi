import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, Phone, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { getLoginCopy } from '../utils/loginCopy'
import './Login.css'

export default function Login() {
    const navigate = useNavigate()
    const { sendOtp, verifyOtp } = useAuth()
    const { language, languages, setLanguage, t } = useLanguage()
    const [step, setStep] = useState('phone')
    const [phone, setPhone] = useState('')
    const [otp, setOtp] = useState('')
    const [error, setError] = useState('')
    const copy = getLoginCopy(language)

    const handleSendOTP = async (event) => {
        event.preventDefault()
        if (phone.length < 10) {
            setError(copy.phoneError)
            return
        }
        setError('')
        try {
            await sendOtp(phone)
            setStep('otp')
        } catch (err) {
            setError(err.message || copy.sendFailed)
        }
    }

    const handleVerifyOTP = async (event) => {
        event.preventDefault()
        if (otp.length < 6) {
            setError(copy.otpError)
            return
        }
        setError('')
        setStep('verifying')
        try {
            const result = await verifyOtp(phone, otp)
            if (result.success) {
                navigate('/dashboard')
            }
        } catch (err) {
            setError(err.message || copy.verifyFailed)
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
                <Link to="/" className="login-back">{copy.back}</Link>
                <div className="login-language">
                    <span>{t('common.change_language')}</span>
                    <select className="select-field" value={language} onChange={(event) => setLanguage(event.target.value)}>
                        {languages.map((item) => (
                            <option key={item.code} value={item.code}>{item.label}</option>
                        ))}
                    </select>
                </div>

                <div className="login-card glass-card">
                    <div className="login-logo">
                        <span className="logo-icon">BS</span>
                        <span className="logo-text" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--primary)' }}>BimaSathi</span>
                    </div>
                    <h1 className="login-title">{copy.title}</h1>
                    <p className="login-desc">{copy.desc}</p>

                    {step === 'phone' && (
                        <form onSubmit={handleSendOTP} className="login-form">
                            <div className="input-group">
                                <label>{t('fields.phoneNumber')}</label>
                                <div className="input-with-icon">
                                    <Phone size={18} className="input-icon" />
                                    <input
                                        type="tel"
                                        className="input-field"
                                        placeholder="+91 98765 43210"
                                        value={phone}
                                        onChange={(event) => setPhone(event.target.value.replace(/[^0-9+]/g, ''))}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            {error && <p className="login-error">{error}</p>}
                            <button type="submit" className="btn btn-primary btn-lg login-btn">
                                {copy.sendOtp} <ArrowRight size={18} />
                            </button>
                        </form>
                    )}

                    {step === 'otp' && (
                        <form onSubmit={handleVerifyOTP} className="login-form">
                            <p className="otp-sent">{copy.otpSent} <strong>{phone}</strong></p>
                            <div className="input-group">
                                <label>{copy.enterOtp}</label>
                                <div className="otp-inputs">
                                    {[0, 1, 2, 3, 4, 5].map((index) => (
                                        <input
                                            key={index}
                                            type="text"
                                            maxLength={1}
                                            className="otp-box"
                                            value={otp[index] || ''}
                                            autoFocus={index === 0}
                                            onChange={(event) => {
                                                const nextValue = event.target.value.replace(/[^0-9]/g, '')
                                                const nextOtp = otp.split('')
                                                nextOtp[index] = nextValue
                                                setOtp(nextOtp.join(''))
                                                if (nextValue && event.target.nextElementSibling) event.target.nextElementSibling.focus()
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Backspace' && !otp[index] && event.target.previousElementSibling) {
                                                    event.target.previousElementSibling.focus()
                                                }
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                            {error && <p className="login-error">{error}</p>}
                            <button type="submit" className="btn btn-primary btn-lg login-btn">
                                <Shield size={18} /> {copy.verify}
                            </button>
                            <button type="button" className="login-resend" onClick={() => setStep('phone')}>
                                {copy.resend}
                            </button>
                        </form>
                    )}

                    {step === 'verifying' && (
                        <div className="login-verifying">
                            <Loader2 size={40} className="spin" />
                            <p>{copy.verifying}</p>
                        </div>
                    )}

                    <div className="login-footer">
                        <Shield size={14} />
                        <span>{copy.footer}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
