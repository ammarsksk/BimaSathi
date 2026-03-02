import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Filter, Search, ChevronDown, ArrowUpDown, Eye, Download, Loader2 } from 'lucide-react'
import api from '../api/client'
import './ClaimsQueue.css'

const STATUS_COLORS = {
    'Draft': 'badge-orange', 'Evidence Pending': 'badge-gold', 'Submitted': 'badge-blue',
    'Acknowledged': 'badge-blue', 'Under Review': 'badge-gold', 'Survey Scheduled': 'badge-blue',
    'Approved': 'badge-green', 'Paid': 'badge-green', 'Rejected': 'badge-red', 'Late Risk': 'badge-red',
}

function urgencyToColor(urgency) {
    if (urgency === 'critical' || urgency === 'overdue') return 'red'
    if (urgency === 'warning') return 'yellow'
    return 'green'
}

export default function ClaimsQueue() {
    const [claims, setClaims] = useState([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('All')
    const [search, setSearch] = useState('')

    useEffect(() => {
        async function load() {
            const data = await api.safeClaims({ limit: 100 })
            setClaims(data.claims || [])
            setLoading(false)
        }
        load()
    }, [])

    const statuses = ['All', ...new Set(claims.map(c => c.status))]

    const filtered = claims
        .filter(c => statusFilter === 'All' || c.status === statusFilter)
        .filter(c => {
            const s = search.toLowerCase()
            return !s || (c.farmerName || '').toLowerCase().includes(s) || c.claimId.toLowerCase().includes(s) || (c.village || '').toLowerCase().includes(s)
        })

    if (loading) {
        return (
            <div className="dashboard-loading">
                <Loader2 size={32} className="spin" />
                <p>Loading claims…</p>
            </div>
        )
    }

    return (
        <div className="claims-page">
            {/* Filter bar */}
            <div className="claims-filters glass-card">
                <div className="filter-search">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search by name, ID, or village…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="filter-search-input"
                    />
                </div>
                <div className="filter-group">
                    <Filter size={15} />
                    <select className="select-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <span className="filter-count">{filtered.length} claims</span>
            </div>

            {/* Table */}
            <div className="claims-table-wrap glass-card">
                <table className="data-table claims-table">
                    <thead>
                        <tr>
                            <th style={{ width: 40 }}></th>
                            <th>Farmer</th>
                            <th>Claim ID</th>
                            <th>Village</th>
                            <th>Crop</th>
                            <th>Status</th>
                            <th>Completeness</th>
                            <th>Deadline</th>
                            <th style={{ width: 80 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((c) => (
                            <tr key={c.claimId}>
                                <td>
                                    <span className={`urgency-dot urgency-${urgencyToColor(c.urgency)}`} />
                                </td>
                                <td className="td-farmer">{c.farmerName || 'Unknown'}</td>
                                <td className="td-id">{c.claimId}</td>
                                <td>{c.village || '—'}</td>
                                <td>{c.cropType || '—'}</td>
                                <td>
                                    <span className={`badge ${STATUS_COLORS[c.status] || 'badge-blue'}`}>{c.status}</span>
                                </td>
                                <td>
                                    <div className="td-score">
                                        <div className="progress-bar" style={{ width: 80 }}>
                                            <div
                                                className={`progress-fill ${c.completenessScore >= 80 ? 'high' : c.completenessScore >= 60 ? 'medium' : 'low'}`}
                                                style={{ width: `${c.completenessScore}%` }}
                                            />
                                        </div>
                                        <span>{c.completenessScore}%</span>
                                    </div>
                                </td>
                                <td className={urgencyToColor(c.urgency) === 'red' ? 'td-deadline-urgent' : ''}>
                                    {c.deadline ? new Date(c.deadline).toLocaleDateString() : '—'}
                                </td>
                                <td>
                                    <div className="td-actions">
                                        <Link to={`/claims/${c.claimId}`} className="action-btn" data-tooltip="View">
                                            <Eye size={16} />
                                        </Link>
                                        <button className="action-btn" data-tooltip="Download PDF">
                                            <Download size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="claims-pagination">
                <span className="pagination-info">Showing 1–{filtered.length} of {filtered.length}</span>
                <div className="pagination-buttons">
                    <button className="btn btn-secondary btn-sm" disabled>Previous</button>
                    <button className="btn btn-primary btn-sm">1</button>
                    <button className="btn btn-secondary btn-sm" disabled>Next</button>
                </div>
            </div>
        </div>
    )
}
