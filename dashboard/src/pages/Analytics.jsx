import { useEffect, useState } from 'react'
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { AlertTriangle, FileText, Loader2, TrendingUp, Users } from 'lucide-react'
import api from '../api/client'
import { useLanguage } from '../context/LanguageContext'
import './Analytics.css'

const CHART_COLORS = ['#2563EB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316']

function CustomTooltip({ active, payload, label, claimsLabel }) {
    if (!active || !payload?.length) return null

    return (
        <div style={{
            background: 'white',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: '0.82rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        }}>
            <p style={{ fontWeight: 600, color: '#0F172A' }}>{label}</p>
            {payload.map((item, index) => (
                <p key={index} style={{ color: item.color }}>{claimsLabel}: {item.value}</p>
            ))}
        </div>
    )
}

export default function Analytics() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const { t, translateValue } = useLanguage()

    useEffect(() => {
        async function load() {
            const result = await api.safeAnalytics()
            setData(result)
            setLoading(false)
        }

        load()
    }, [])

    if (loading) {
        return (
            <div className="dashboard-loading">
                <Loader2 size={32} className="spin" />
                <p>{t('analytics.loading')}</p>
            </div>
        )
    }

    const statusData = Object.entries(data.byStatus || {}).map(([name, value]) => ({ name: translateValue(name), value }))
    const cropData = Object.entries(data.byCrop || {}).map(([name, value]) => ({ name: translateValue(name), value }))
    const dailyData = Object.entries(data.dailyCounts || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, claims]) => ({
            date: date.split('-').slice(1).join('/'),
            claims,
        }))

    const summaryStats = [
        { label: t('analytics.total_claims'), value: String(data.totalClaims || 0), icon: FileText, color: 'var(--primary)' },
        { label: t('analytics.active_farmers'), value: String(data.totalClaims ? Math.round(data.totalClaims * 0.7) : 0), icon: Users, color: 'var(--emerald)' },
        { label: t('analytics.avg_completeness'), value: `${data.avgCompleteness || 0}%`, icon: TrendingUp, color: 'var(--amber)' },
        { label: t('analytics.rejection_rate'), value: `${data.totalClaims ? ((data.byStatus?.Rejected || 0) / data.totalClaims * 100).toFixed(1) : 0}%`, icon: AlertTriangle, color: 'var(--red)' },
    ]

    return (
        <div className="analytics-page">
            <div className="analytics-summary">
                {summaryStats.map((stat) => (
                    <div key={stat.label} className="glass-card analytics-stat">
                        <stat.icon size={20} style={{ color: stat.color }} />
                        <span className="analytics-stat-value">{stat.value}</span>
                        <span className="analytics-stat-label">{stat.label}</span>
                    </div>
                ))}
            </div>

            <div className="analytics-grid">
                <div className="glass-card analytics-card card-wide">
                    <h3>{t('analytics.daily_claim_volume')}</h3>
                    <div className="chart-wrap">
                        {dailyData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <AreaChart data={dailyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94A3B8' }} />
                                    <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip claimsLabel={t('analytics.claims')} />} />
                                    <Area type="monotone" dataKey="claims" stroke="#2563EB" fill="rgba(37,99,235,0.1)" strokeWidth={2} name={t('analytics.claims')} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="analytics-empty">{t('common.no_activity')}</div>
                        )}
                    </div>
                </div>

                <div className="glass-card analytics-card">
                    <h3>{t('analytics.claims_by_status')}</h3>
                    <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={statusData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} allowDecimals={false} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#94A3B8' }} width={110} />
                                <Tooltip content={<CustomTooltip claimsLabel={t('analytics.claims')} />} />
                                <Bar dataKey="value" fill="#2563EB" radius={[0, 4, 4, 0]} name={t('analytics.claims')} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="glass-card analytics-card">
                    <h3>{t('analytics.claims_by_crop')}</h3>
                    <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={cropData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} allowDecimals={false} />
                                <Tooltip content={<CustomTooltip claimsLabel={t('analytics.claims')} />} />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} name={t('analytics.claims')}>
                                    {cropData.map((item, index) => (
                                        <Cell key={`${item.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    )
}
