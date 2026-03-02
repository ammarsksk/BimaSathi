import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
    FileText, Clock, CheckCircle2, AlertTriangle, TrendingUp,
    ArrowUpRight, ArrowRight, Users, Send, Loader2
} from 'lucide-react'
import api from '../api/client'
import './Dashboard.css'

function getStatusColor(status) {
    if (['Approved', 'Paid'].includes(status)) return 'badge-green'
    if (['Rejected'].includes(status)) return 'badge-red'
    if (['Draft', 'Late Risk'].includes(status)) return 'badge-orange'
    return 'badge-blue'
}

function urgencyToColor(urgency) {
    if (urgency === 'critical' || urgency === 'overdue') return 'red'
    if (urgency === 'warning') return 'yellow'
    return 'green'
}

function timeAgo(dateStr) {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins} min ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
}

export default function Dashboard() {
    const [data, setData] = useState(null)
    const [claims, setClaims] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            const [analyticsData, claimsData] = await Promise.all([
                api.safeAnalytics(),
                api.safeClaims({ limit: 10 }),
            ])
            setData(analyticsData)
            setClaims(claimsData.claims || [])
            setLoading(false)
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="dashboard-loading">
                <Loader2 size={32} className="spin" />
                <p>Loading dashboard…</p>
            </div>
        )
    }

    const KPIS = [
        { label: 'Total Claims', value: String(data?.totalClaims || 0), icon: FileText, color: 'var(--primary)', bg: 'var(--primary-soft)' },
        { label: 'Pending Submission', value: String(data?.pendingSubmission || 0), icon: Clock, color: 'var(--amber)', bg: 'var(--amber-soft)' },
        { label: 'Avg Completeness', value: `${data?.avgCompleteness || 0}%`, icon: TrendingUp, color: 'var(--emerald)', bg: 'var(--emerald-soft)' },
        { label: 'Due in 24 Hours', value: String(data?.due24Hours || 0), icon: AlertTriangle, color: 'var(--red)', bg: 'var(--red-soft)', urgent: true },
    ]

    const recentClaims = claims.slice(0, 5)
    const urgentClaims = claims.filter(c => c.urgency === 'critical' || c.urgency === 'warning').slice(0, 3)

    return (
        <div className="dashboard-page">
            {/* KPIs */}
            <div className="kpi-grid">
                {KPIS.map((kpi, i) => (
                    <div key={i} className={`glass-card kpi-card ${kpi.urgent ? 'kpi-urgent' : ''}`}>
                        <div className="kpi-icon" style={{ color: kpi.color, background: kpi.bg }}>
                            <kpi.icon size={22} />
                        </div>
                        <div className="kpi-info">
                            <span className="kpi-label">{kpi.label}</span>
                            <span className="kpi-value">{kpi.value}</span>
                        </div>
                        <ArrowUpRight size={16} className="kpi-arrow" />
                    </div>
                ))}
            </div>

            <div className="dashboard-grid">
                {/* Recent Activity */}
                <div className="glass-card dash-card">
                    <div className="dash-card-header">
                        <h2>Recent Claims</h2>
                        <Link to="/claims" className="btn btn-ghost btn-sm">View All <ArrowRight size={14} /></Link>
                    </div>
                    <div className="dash-card-body">
                        {recentClaims.map(c => (
                            <Link key={c.claimId} to={`/claims/${c.claimId}`} className="activity-row">
                                <span className={`urgency-dot urgency-${urgencyToColor(c.urgency)}`} />
                                <div className="activity-info">
                                    <span className="activity-name">{c.farmerName || 'Unknown Farmer'}</span>
                                    <span className="activity-action">{c.claimId} · {c.cropType} · {c.village}</span>
                                </div>
                                <span className={`badge ${getStatusColor(c.status)}`}>{c.status}</span>
                                <span className="activity-time">{timeAgo(c.createdAt)}</span>
                            </Link>
                        ))}
                        {recentClaims.length === 0 && <p className="empty-state">No claims yet</p>}
                    </div>
                </div>

                {/* Urgent Queue */}
                <div className="glass-card dash-card">
                    <div className="dash-card-header">
                        <h2>⚠️ Urgent Queue</h2>
                        <Link to="/claims" className="btn btn-ghost btn-sm">All Claims <ArrowRight size={14} /></Link>
                    </div>
                    <div className="dash-card-body">
                        {urgentClaims.map(c => (
                            <Link key={c.claimId} to={`/claims/${c.claimId}`} className="urgent-row glass-card">
                                <div className="urgent-top">
                                    <span className="urgent-id">{c.claimId}</span>
                                    <span className="urgent-farmer">{c.farmerName}</span>
                                </div>
                                <div className="urgent-bottom">
                                    <span className="urgent-crop">{c.cropType}</span>
                                    <span className="urgent-deadline">{c.deadline ? new Date(c.deadline).toLocaleDateString() : 'N/A'}</span>
                                    <div className="td-score">
                                        <div className="progress-bar" style={{ width: 60 }}>
                                            <div
                                                className={`progress-fill ${c.completenessScore >= 80 ? 'high' : c.completenessScore >= 60 ? 'medium' : 'low'}`}
                                                style={{ width: `${c.completenessScore}%` }}
                                            />
                                        </div>
                                        <span>{c.completenessScore}%</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                        {urgentClaims.length === 0 && <p className="empty-state">No urgent claims 🎉</p>}
                    </div>
                </div>
            </div>
        </div>
    )
}
