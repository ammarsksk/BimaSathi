import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
    ArrowLeft, Download, Send, Flag, CheckCircle2, Clock, MapPin,
    Phone, User, Camera, FileText, Shield, AlertTriangle, Eye, Loader2
} from 'lucide-react'
import api from '../api/client'
import './ClaimDetail.css'

function statusIcon(status) {
    if (['Approved', 'Paid'].includes(status)) return <CheckCircle2 size={16} />
    if (['Rejected'].includes(status)) return <AlertTriangle size={16} />
    return <Clock size={16} />
}

const STATUS_STEPS = ['Draft', 'Evidence Pending', 'Submitted', 'Acknowledged', 'Under Review', 'Survey Scheduled', 'Approved', 'Paid']

function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ClaimDetail() {
    const { id } = useParams()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [submitResult, setSubmitResult] = useState(null)

    useEffect(() => {
        async function load() {
            const result = await api.safeClaimDetail(id)
            setData(result)
            setLoading(false)
        }
        load()
    }, [id])

    const handleSubmit = async () => {
        setSubmitting(true)
        try {
            const result = await api.safeSubmitClaim(data.claim.claimId, 'operator')
            setSubmitResult(result)
            if (result.success) {
                setData(prev => ({
                    ...prev,
                    claim: { ...prev.claim, status: 'Submitted' },
                }))
            }
        } catch (err) {
            setSubmitResult({ error: err.message })
        }
        setSubmitting(false)
    }

    if (loading) {
        return (
            <div className="dashboard-loading">
                <Loader2 size={32} className="spin" />
                <p>Loading claim detail…</p>
            </div>
        )
    }

    const { claim, farmer, evidence, auditLog } = data
    const currentStepIdx = STATUS_STEPS.indexOf(claim.status)

    return (
        <div className="claim-detail-page">
            {/* Header */}
            <div className="detail-header">
                <Link to="/claims" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> Back to Queue</Link>
                <div className="detail-header-right">
                    <button className="btn btn-secondary btn-sm"><Download size={16} /> Download PDF</button>
                    {!['Submitted', 'Acknowledged', 'Under Review', 'Approved', 'Paid'].includes(claim.status) && (
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleSubmit}
                            disabled={submitting || claim.completenessScore < 80}
                        >
                            {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                            {submitting ? 'Submitting…' : 'Submit to Insurer'}
                        </button>
                    )}
                </div>
            </div>

            {submitResult && (
                <div className={`detail-alert ${submitResult.success ? 'alert-success' : 'alert-error'}`}>
                    {submitResult.success ? '✅ Claim submitted successfully!' : `❌ ${submitResult.error}`}
                </div>
            )}

            <div className="detail-grid">
                {/* Left Column */}
                <div className="detail-left">
                    {/* Claim Summary */}
                    <div className="glass-card detail-card">
                        <div className="detail-card-head">
                            <h2>{claim.claimId}</h2>
                            <span className={`badge ${claim.status === 'Approved' || claim.status === 'Paid' ? 'badge-green' : claim.status === 'Rejected' ? 'badge-red' : 'badge-blue'}`}>
                                {claim.status}
                            </span>
                        </div>
                        <div className="detail-info-grid">
                            <div className="detail-info-item">
                                <span className="detail-info-label">Crop</span>
                                <span className="detail-info-value">{claim.cropType || '—'}</span>
                            </div>
                            <div className="detail-info-item">
                                <span className="detail-info-label">Season</span>
                                <span className="detail-info-value">{claim.season || '—'}</span>
                            </div>
                            <div className="detail-info-item">
                                <span className="detail-info-label">Loss Date</span>
                                <span className="detail-info-value">{claim.lossDate || '—'}</span>
                            </div>
                            <div className="detail-info-item">
                                <span className="detail-info-label">Cause</span>
                                <span className="detail-info-value">{claim.cause || '—'}</span>
                            </div>
                            <div className="detail-info-item">
                                <span className="detail-info-label">Area (Hectares)</span>
                                <span className="detail-info-value">{claim.areaHectares || '—'}</span>
                            </div>
                            <div className="detail-info-item">
                                <span className="detail-info-label">Created</span>
                                <span className="detail-info-value">{formatDate(claim.createdAt)}</span>
                            </div>
                        </div>
                        <div className="detail-score-row">
                            <span className="detail-score-label">Completeness</span>
                            <div className="detail-score-bar">
                                <div className="progress-bar" style={{ flex: 1, height: 8 }}>
                                    <div
                                        className={`progress-fill ${claim.completenessScore >= 80 ? 'high' : claim.completenessScore >= 60 ? 'medium' : 'low'}`}
                                        style={{ width: `${claim.completenessScore}%` }}
                                    />
                                </div>
                                <span className="detail-score-value">{claim.completenessScore}%</span>
                            </div>
                        </div>
                        {claim.deadline && (
                            <div className="detail-deadline">
                                <Clock size={14} />
                                Deadline: {new Date(claim.deadline).toLocaleString()}
                                {claim.urgency === 'critical' && <span className="badge badge-red" style={{ marginLeft: 8 }}>URGENT</span>}
                            </div>
                        )}
                    </div>

                    {/* Evidence Photos */}
                    <div className="glass-card detail-card">
                        <h3><Camera size={16} /> Evidence Photos ({evidence?.photos?.length || 0})</h3>
                        <div className="evidence-grid">
                            {(evidence?.photos || []).map((p, i) => (
                                <div key={i} className="evidence-photo">
                                    <img src={p.url} alt={p.key} loading="lazy" />
                                    <span className="evidence-label">{p.key}</span>
                                </div>
                            ))}
                        </div>
                        {evidence?.documents?.length > 0 && (
                            <div className="evidence-docs">
                                <h4><FileText size={14} /> Documents</h4>
                                {evidence.documents.map((d, i) => (
                                    <div key={i} className="evidence-doc-row">
                                        <FileText size={14} />
                                        <span>{d.key}</span>
                                        <span className="evidence-doc-size">{Math.round(d.size / 1024)}KB</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Status Timeline */}
                    <div className="glass-card detail-card">
                        <h3><Clock size={16} /> Claim Progress</h3>
                        <div className="status-timeline">
                            {STATUS_STEPS.map((step, i) => (
                                <div key={step} className={`timeline-step ${i <= currentStepIdx ? 'done' : ''} ${i === currentStepIdx ? 'current' : ''}`}>
                                    <div className="timeline-dot">
                                        {i < currentStepIdx && <CheckCircle2 size={14} />}
                                        {i === currentStepIdx && statusIcon(claim.status)}
                                    </div>
                                    <span className="timeline-label">{step}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="detail-right">
                    {/* Farmer Profile */}
                    <div className="glass-card detail-card">
                        <h3><User size={16} /> Farmer Profile</h3>
                        {farmer ? (
                            <div className="farmer-profile">
                                <div className="farmer-avatar">{(farmer.name || 'F')[0]}</div>
                                <div className="farmer-info">
                                    <span className="farmer-name">{farmer.name || 'Unknown'}</span>
                                    <span className="farmer-detail"><Phone size={12} /> {farmer.phone}</span>
                                    <span className="farmer-detail"><MapPin size={12} /> {farmer.village}, {farmer.district}</span>
                                    <span className="farmer-detail">🗣️ {farmer.language}</span>
                                </div>
                            </div>
                        ) : (
                            <p className="empty-state">Farmer profile unavailable</p>
                        )}
                    </div>

                    {/* Audit Log */}
                    <div className="glass-card detail-card">
                        <h3><Shield size={16} /> Audit Trail</h3>
                        <div className="audit-log">
                            {(auditLog || []).map((entry, i) => (
                                <div key={i} className="audit-entry">
                                    <div className="audit-dot" />
                                    <div className="audit-content">
                                        <span className="audit-action">{entry.action}</span>
                                        <span className="audit-meta">{entry.actor} · {formatDate(entry.timestamp)}</span>
                                    </div>
                                </div>
                            ))}
                            {(!auditLog || auditLog.length === 0) && <p className="empty-state">No audit entries</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
