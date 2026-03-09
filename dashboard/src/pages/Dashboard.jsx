import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock3, FileText, Loader2, ShieldCheck, Users } from 'lucide-react'
import api from '../api/client'
import { useLanguage } from '../context/LanguageContext'
import './Dashboard.css'

function urgencyClass(claim) {
    if (!claim.deadline) return 'green'
    const diff = new Date(claim.deadline).getTime() - Date.now()
    if (diff <= 24 * 60 * 60 * 1000) return 'red'
    if (diff <= 72 * 60 * 60 * 1000) return 'yellow'
    return 'green'
}

export default function Dashboard() {
    const [loading, setLoading] = useState(true)
    const [analytics, setAnalytics] = useState(null)
    const [access, setAccess] = useState([])
    const [claims, setClaims] = useState([])
    const { t, translateValue } = useLanguage()

    useEffect(() => {
        async function load() {
            setLoading(true)
            try {
                const bootstrap = await api.safeDashboardBootstrap()
                const claimResult = await api.getOperatorClaims({ limit: 8 })
                setAnalytics(bootstrap.analytics)
                setAccess(bootstrap.access || [])
                setClaims(claimResult.claims || [])
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="dashboard-loading">
                <Loader2 size={32} className="spin" />
                <p>{t('common.loading')}</p>
            </div>
        )
    }

    const pendingAccess = access.filter((item) => item.status !== 'verified')
    const kpis = [
        { label: t('dashboard.accessible_farmers'), value: analytics?.accessibleFarmers || 0, icon: Users, color: 'var(--primary)' },
        { label: t('dashboard.assisted_claims'), value: analytics?.totalClaims || 0, icon: FileText, color: 'var(--emerald)' },
        { label: t('dashboard.pending_submission'), value: analytics?.pendingSubmission || 0, icon: Clock3, color: 'var(--amber)' },
        { label: t('dashboard.pending_access'), value: pendingAccess.length, icon: ShieldCheck, color: 'var(--red)' },
    ]

    return (
        <div className="dashboard-page">
            <div className="kpi-grid">
                {kpis.map((item) => (
                    <div key={item.label} className="glass-card kpi-card">
                        <div className="kpi-icon" style={{ color: item.color, background: 'var(--bg-soft)' }}>
                            <item.icon size={22} />
                        </div>
                        <div className="kpi-info">
                            <span className="kpi-label">{item.label}</span>
                            <span className="kpi-value">{item.value}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="dashboard-grid">
                <section className="glass-card dash-card">
                    <div className="dash-card-header">
                        <h2>{t('dashboard.consent_queue')}</h2>
                        <Link to="/access" className="btn btn-ghost btn-sm">{t('dashboard.open_access_center')} <ArrowRight size={14} /></Link>
                    </div>
                    <div className="dash-card-body">
                        {pendingAccess.length === 0 ? (
                            <p className="empty-state">{t('dashboard.no_pending_consent')}</p>
                        ) : pendingAccess.map((item) => (
                            <Link key={item.farmerPhone} to="/access" className="activity-row">
                                <span className="activity-name">{item.farmerName || item.farmerPhone}</span>
                                <span className="activity-action">{translateValue(item.status)} · {item.requestedAt ? new Date(item.requestedAt).toLocaleString() : 'just now'}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="glass-card dash-card">
                    <div className="dash-card-header">
                        <h2>{t('dashboard.recent_assisted_claims')}</h2>
                        <Link to="/claims" className="btn btn-ghost btn-sm">{t('dashboard.open_queue')} <ArrowRight size={14} /></Link>
                    </div>
                    <div className="dash-card-body">
                        {claims.length === 0 ? (
                            <p className="empty-state">{t('dashboard.no_claims')}</p>
                        ) : claims.map((claim) => (
                            <Link key={claim.claimId} to={`/claims/${claim.claimId}`} className="activity-row">
                                <span className={`urgency-dot urgency-${urgencyClass(claim)}`} />
                                <div className="activity-info">
                                    <span className="activity-name">{claim.farmerName || claim.claimId}</span>
                                    <span className="activity-action">{claim.claimId} · {claim.cropType ? translateValue(claim.cropType) : '-'} · {translateValue(claim.status)}</span>
                                </div>
                                <span className="activity-time">{claim.completenessScore}% {t('common.complete')}</span>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
