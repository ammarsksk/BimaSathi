import { useState, useEffect } from 'react'
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { TrendingUp, Users, FileText, AlertTriangle, Loader2 } from 'lucide-react'
import api from '../api/client'
import './Analytics.css'

const PIE_COLORS = ['#2563EB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316']

function CustomTooltip({ active, payload, label }) {
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
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
            ))}
        </div>
    )
}

export default function Analytics() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

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
                <p>Loading analytics…</p>
            </div>
        )
    }

    // Transform API data for charts
    const statusData = Object.entries(data.byStatus || {}).map(([name, value]) => ({ name, value }))
    const cropData = Object.entries(data.byCrop || {}).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    const dailyData = Object.entries(data.dailyCounts || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date: date.split('-').slice(1).join('/'), claims: count }))
    const rejectionData = Object.entries(data.rejectionReasons || {}).map(([name, value], i) => ({
        name, value, fill: PIE_COLORS[i % PIE_COLORS.length],
    }))

    const SUMMARY_STATS = [
        { label: 'Total Claims', value: String(data.totalClaims || 0), icon: FileText, color: 'var(--primary)' },
        { label: 'Active Farmers', value: String(data.totalClaims ? Math.round(data.totalClaims * 0.7) : 0), icon: Users, color: 'var(--emerald)' },
        { label: 'Avg Completeness', value: `${data.avgCompleteness || 0}%`, icon: TrendingUp, color: 'var(--amber)' },
        { label: 'Rejection Rate', value: `${data.totalClaims ? ((data.byStatus?.Rejected || 0) / data.totalClaims * 100).toFixed(1) : 0}%`, icon: AlertTriangle, color: 'var(--red)' },
    ]

    return (
        <div className="analytics-page">
            {/* Summary Row */}
            <div className="analytics-summary">
                {SUMMARY_STATS.map((s, i) => (
                    <div key={i} className="glass-card analytics-stat">
                        <s.icon size={20} style={{ color: s.color }} />
                        <span className="analytics-stat-value">{s.value}</span>
                        <span className="analytics-stat-label">{s.label}</span>
                    </div>
                ))}
            </div>

            <div className="analytics-grid">
                {/* Daily Trend */}
                <div className="glass-card analytics-card card-wide">
                    <h3>Daily Claim Volume</h3>
                    <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={dailyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94A3B8' }} />
                                <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="claims" stroke="#2563EB" fill="rgba(37,99,235,0.1)" strokeWidth={2} name="Claims" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="glass-card analytics-card">
                    <h3>Claims by Status</h3>
                    <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={statusData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#94A3B8' }} width={110} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="value" fill="#2563EB" radius={[0, 4, 4, 0]} name="Claims" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Crop Distribution */}
                <div className="glass-card analytics-card">
                    <h3>Claims by Crop Type</h3>
                    <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={cropData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Claims">
                                    {cropData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Rejection Reasons */}
                <div className="glass-card analytics-card card-wide">
                    <h3>Rejection Reasons</h3>
                    <div className="chart-wrap" style={{ display: 'flex', alignItems: 'center' }}>
                        <ResponsiveContainer width="50%" height={250}>
                            <PieChart>
                                <Pie
                                    data={rejectionData}
                                    cx="50%" cy="50%"
                                    innerRadius={60} outerRadius={100}
                                    paddingAngle={3}
                                    dataKey="value"
                                >{rejectionData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}</Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="pie-legend">
                            {rejectionData.map((r, i) => (
                                <div key={i} className="pie-legend-item">
                                    <span className="pie-legend-dot" style={{ background: r.fill }} />
                                    <span className="pie-legend-label">{r.name}</span>
                                    <span className="pie-legend-value">{r.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
