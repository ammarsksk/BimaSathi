import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react'
import api from '../api/client'
import { useLanguage } from '../context/LanguageContext'
import './ClaimsQueue.css'

const STATUS_COLORS = {
    Draft: 'badge-orange',
    Submitted: 'badge-blue',
    Approved: 'badge-green',
    Paid: 'badge-green',
    Rejected: 'badge-red',
    'Evidence Pending': 'badge-gold',
    'Under Review': 'badge-blue',
    'Survey Scheduled': 'badge-blue',
    'Appeal Filed': 'badge-blue',
}

function urgencyColor(claim) {
    if (!claim.deadline) return 'green'
    const diff = new Date(claim.deadline).getTime() - Date.now()
    if (diff <= 24 * 60 * 60 * 1000) return 'red'
    if (diff <= 72 * 60 * 60 * 1000) return 'yellow'
    return 'green'
}

function canDiscardClaim(claim) {
    return ['Draft', 'Evidence Pending'].includes(claim?.status)
}

export default function ClaimsQueue() {
    const [claims, setClaims] = useState([])
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState('')
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [error, setError] = useState('')
    const { t, translateValue } = useLanguage()

    useEffect(() => {
        loadClaims()
    }, [status])

    async function loadClaims() {
        setLoading(true)
        setError('')
        try {
            const result = await api.getOperatorClaims({ limit: 200, status })
            setClaims(result.claims || [])
        } catch (err) {
            setError(err.message || 'Failed to load operator claims')
        } finally {
            setLoading(false)
        }
    }

    async function handleDiscardClaim(claim) {
        if (!canDiscardClaim(claim)) return
        if (!window.confirm(`${t('common.delete_draft')} ${claim.claimId}?`)) {
            return
        }

        setDeletingId(claim.claimId)
        setError('')
        try {
            await api.deleteOperatorClaim(claim.claimId)
            setClaims((current) => current.filter((item) => item.claimId !== claim.claimId))
        } catch (err) {
            setError(err.message || 'Failed to discard draft claim')
        } finally {
            setDeletingId('')
        }
    }

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase()
        return claims.filter((claim) => {
            if (!needle) return true
            return [claim.claimId, claim.farmerName, claim.phoneNumber, claim.village, claim.cropType]
                .some((field) => String(field || '').toLowerCase().includes(needle))
        })
    }, [claims, search])

    const statuses = useMemo(() => ['All', ...new Set(claims.map((claim) => claim.status).filter(Boolean))], [claims])

    if (loading) {
        return (
            <div className="dashboard-loading">
                <Loader2 size={32} className="spin" />
                <p>{t('claims.loading')}</p>
            </div>
        )
    }

    return (
        <div className="claims-page">
            {error && <div className="claims-error">{error}</div>}

            <div className="claims-filters glass-card">
                <div className="filter-search">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder={t('claims.search_placeholder')}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="filter-search-input"
                    />
                </div>
                <div className="filter-group">
                    <select className="select-field" value={status} onChange={(event) => setStatus(event.target.value === 'All' ? '' : event.target.value)}>
                        {statuses.map((value) => (
                            <option key={value} value={value}>
                                {value === 'All' ? t('claims.all_statuses') : translateValue(value)}
                            </option>
                        ))}
                    </select>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={loadClaims}>
                    <RefreshCw size={14} />
                    {t('common.refresh')}
                </button>
            </div>

            <div className="claims-table-wrap glass-card">
                <table className="data-table claims-table">
                    <thead>
                        <tr>
                            <th />
                            <th>{t('claims.farmer')}</th>
                            <th>{t('claims.claim_id')}</th>
                            <th>{t('claims.village')}</th>
                            <th>{t('claims.crop')}</th>
                            <th>{t('claims.status')}</th>
                            <th>{t('claims.pending')}</th>
                            <th>{t('claims.deadline')}</th>
                            <th>{t('claims.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((claim) => (
                            <tr key={claim.claimId}>
                                <td><span className={`urgency-dot urgency-${urgencyColor(claim)}`} /></td>
                                <td className="td-farmer">
                                    <strong>{claim.farmerName || t('claims.unknown_farmer')}</strong>
                                    <div className="td-sub">{claim.phoneNumber || '-'}</div>
                                </td>
                                <td className="td-id">{claim.claimId}</td>
                                <td>{claim.village || '-'}</td>
                                <td>{claim.cropType ? translateValue(claim.cropType) : '-'}</td>
                                <td><span className={`badge ${STATUS_COLORS[claim.status] || 'badge-blue'}`}>{translateValue(claim.status)}</span></td>
                                <td>{Number(claim.pendingFieldsCount || 0)} {t('common.fields')}</td>
                                <td>{claim.deadline ? new Date(claim.deadline).toLocaleString() : '-'}</td>
                                <td>
                                    <div className="td-actions">
                                        <Link to={`/claims/${claim.claimId}`} className="action-btn" data-tooltip={t('claims.open_workspace')}>
                                            <Eye size={16} />
                                        </Link>
                                        {canDiscardClaim(claim) ? (
                                            <button
                                                type="button"
                                                className="action-btn action-btn-danger"
                                                data-tooltip={t('common.delete_draft')}
                                                onClick={() => handleDiscardClaim(claim)}
                                                disabled={deletingId === claim.claimId}
                                            >
                                                {deletingId === claim.claimId ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                                            </button>
                                        ) : null}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && <div className="claims-empty">{t('claims.no_matches')}</div>}
            </div>
        </div>
    )
}
