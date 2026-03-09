import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock3, FolderOpen, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import api from '../api/client'
import { useLanguage } from '../context/LanguageContext'
import { getFieldChoiceOptions, validateFieldValue } from '../utils/claimSupport'
import './FarmerAccess.css'

const INITIAL_REQUEST = {
    farmerPhone: '',
    farmerName: '',
    village: '',
    district: '',
    state: '',
}

const INITIAL_CLAIM = {
    cropType: '',
    season: '',
    lossDate: '',
    cause: '',
    areaHectares: '',
    policyType: '',
    selectedTemplateId: '',
}

function statusTone(status) {
    if (status === 'verified') return 'badge-green'
    if (status === 'revoked' || status === 'expired') return 'badge-red'
    return 'badge-blue'
}

function canDiscardClaim(claim) {
    return ['Draft', 'Evidence Pending'].includes(claim?.status)
}

export default function FarmerAccess() {
    const navigate = useNavigate()
    const { t, translateValue } = useLanguage()
    const [requestForm, setRequestForm] = useState(INITIAL_REQUEST)
    const [claimForm, setClaimForm] = useState(INITIAL_CLAIM)
    const [accessItems, setAccessItems] = useState([])
    const [selectedFarmer, setSelectedFarmer] = useState(null)
    const [farmerClaims, setFarmerClaims] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [claimSaving, setClaimSaving] = useState(false)
    const [claimDeletingId, setClaimDeletingId] = useState('')
    const [otpInputs, setOtpInputs] = useState({})
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    const verifiedFarmers = useMemo(
        () => accessItems.filter((item) => item.status === 'verified'),
        [accessItems]
    )

    const cropOptions = getFieldChoiceOptions('cropType')
    const seasonOptions = getFieldChoiceOptions('season')
    const causeOptions = getFieldChoiceOptions('cause')
    const policyOptions = getFieldChoiceOptions('policyType')

    useEffect(() => {
        loadAccess()
    }, [])

    async function loadAccess() {
        setLoading(true)
        setError('')
        try {
            const result = await api.getAccessScope()
            const items = result.access || []
            setAccessItems(items)
            if (selectedFarmer) {
                const refreshed = items.find((item) => item.farmerPhone === selectedFarmer.farmerPhone)
                if (refreshed?.status === 'verified') {
                    await loadFarmerClaims(refreshed)
                } else if (!refreshed) {
                    setSelectedFarmer(null)
                    setFarmerClaims([])
                }
            }
        } catch (err) {
            setError(err.message || 'Failed to load operator access')
        } finally {
            setLoading(false)
        }
    }

    async function loadFarmerClaims(farmer) {
        setSelectedFarmer(farmer)
        setMessage('')
        try {
            const result = await api.getFarmerClaims(farmer.farmerPhone)
            setFarmerClaims(result.claims || [])
        } catch (err) {
            setError(err.message || 'Failed to load farmer claims')
        }
    }

    async function handleRequestAccess(event) {
        event.preventDefault()
        setSaving(true)
        setError('')
        setMessage('')
        try {
            const result = await api.requestFarmerAccess(requestForm)
            setMessage(
                result.consent?.otpChannel
                    ? `${t('access.request_sent')} ${result.consent.farmerPhone}.`
                    : `Consent request recorded for ${result.consent?.farmerPhone}.`
            )
            setRequestForm(INITIAL_REQUEST)
            await loadAccess()
        } catch (err) {
            setError(err.message || 'Failed to request farmer access')
        } finally {
            setSaving(false)
        }
    }

    async function handleVerifyAccess(farmerPhone) {
        setSaving(true)
        setError('')
        setMessage('')
        try {
            await api.verifyFarmerAccess({
                farmerPhone,
                code: otpInputs[farmerPhone] || '',
            })
            setMessage(`${translateValue('verified')}: ${farmerPhone}`)
            await loadAccess()
            const verified = accessItems.find((item) => item.farmerPhone === farmerPhone) || { farmerPhone, status: 'verified' }
            await loadFarmerClaims(verified)
        } catch (err) {
            setError(err.message || 'Failed to verify farmer access')
        } finally {
            setSaving(false)
        }
    }

    async function handleRevokeAccess(farmerPhone) {
        setSaving(true)
        setError('')
        setMessage('')
        try {
            await api.revokeFarmerAccess({ farmerPhone })
            setAccessItems((current) => current.filter((item) => item.farmerPhone !== farmerPhone))
            if (selectedFarmer?.farmerPhone === farmerPhone) {
                setSelectedFarmer(null)
                setFarmerClaims([])
            }
            setMessage(`${t('common.revoke')}: ${farmerPhone}`)
            await loadAccess()
        } catch (err) {
            setError(err.message || 'Failed to revoke farmer access')
        } finally {
            setSaving(false)
        }
    }

    async function handleCreateClaim(event) {
        event.preventDefault()
        if (!selectedFarmer) return

        const validations = [
            ['cropType', validateFieldValue({ fieldName: 'cropType' }, claimForm.cropType)],
            ['season', validateFieldValue({ fieldName: 'season' }, claimForm.season)],
            ['lossDate', validateFieldValue({ fieldName: 'lossDate', fieldType: 'date' }, claimForm.lossDate)],
            ['cause', validateFieldValue({ fieldName: 'cause' }, claimForm.cause)],
            ['areaHectares', validateFieldValue({ fieldName: 'areaHectares', fieldType: 'number' }, claimForm.areaHectares)],
            ['policyType', validateFieldValue({ fieldName: 'policyType' }, claimForm.policyType)],
        ]

        for (const [, validation] of validations) {
            if (!validation.ok) {
                setError(t(validation.errorKey))
                return
            }
        }

        setClaimSaving(true)
        setError('')
        setMessage('')
        try {
            const result = await api.createOperatorClaim({
                farmerPhone: selectedFarmer.farmerPhone,
                farmerName: selectedFarmer.farmerName || requestForm.farmerName,
                village: selectedFarmer.farmerVillage || requestForm.village,
                district: requestForm.district || selectedFarmer.farmerDistrict,
                state: requestForm.state || selectedFarmer.farmerState,
                cropType: validations[0][1].value,
                season: validations[1][1].value,
                lossDate: validations[2][1].value,
                cause: validations[3][1].value,
                areaHectares: validations[4][1].value,
                policyType: validations[5][1].value,
                selectedTemplateId: claimForm.selectedTemplateId,
            })
            setClaimForm(INITIAL_CLAIM)
            navigate(`/claims/${result.claim.claimId}`)
        } catch (err) {
            setError(err.message || 'Failed to create claim')
        } finally {
            setClaimSaving(false)
        }
    }

    async function handleDiscardClaim(claim) {
        if (!canDiscardClaim(claim)) return
        if (!window.confirm(`${t('common.delete_draft')} ${claim.claimId}?`)) {
            return
        }

        setClaimDeletingId(claim.claimId)
        setError('')
        setMessage('')
        try {
            await api.deleteOperatorClaim(claim.claimId)
            await loadAccess()
            setMessage(`${t('common.delete_draft')}: ${claim.claimId}`)
        } catch (err) {
            setError(err.message || 'Failed to discard draft claim')
        } finally {
            setClaimDeletingId('')
        }
    }

    return (
        <div className="access-page">
            <div className="access-hero glass-card">
                <div>
                    <h2>{t('access.title')}</h2>
                    <p>{t('access.subtitle')}</p>
                </div>
                <div className="access-hero-stats">
                    <div>
                        <strong>{verifiedFarmers.length}</strong>
                        <span>{t('access.verified_farmers')}</span>
                    </div>
                    <div>
                        <strong>{accessItems.filter((item) => item.status !== 'verified').length}</strong>
                        <span>{t('access.pending_requests')}</span>
                    </div>
                </div>
            </div>

            {error && <div className="access-alert access-alert-error">{error}</div>}
            {message && <div className="access-alert access-alert-success">{message}</div>}

            <div className="access-grid">
                <section className="glass-card access-card">
                    <div className="access-card-head">
                        <h3><ShieldCheck size={16} /> {t('access.request_farmer_access')}</h3>
                    </div>
                    <form className="access-form" onSubmit={handleRequestAccess}>
                        <label>
                            {t('fields.phoneNumber')}
                            <input
                                className="input-field"
                                value={requestForm.farmerPhone}
                                onChange={(event) => setRequestForm((current) => ({ ...current, farmerPhone: event.target.value }))}
                                placeholder="+91..."
                            />
                        </label>
                        <label>
                            {t('fields.farmerName')}
                            <input
                                className="input-field"
                                value={requestForm.farmerName}
                                onChange={(event) => setRequestForm((current) => ({ ...current, farmerName: event.target.value }))}
                                placeholder={t('fields.farmerName')}
                            />
                        </label>
                        <div className="access-form-row">
                            <label>
                                {t('fields.village')}
                                <input
                                    className="input-field"
                                    value={requestForm.village}
                                    onChange={(event) => setRequestForm((current) => ({ ...current, village: event.target.value }))}
                                />
                            </label>
                            <label>
                                {t('fields.district')}
                                <input
                                    className="input-field"
                                    value={requestForm.district}
                                    onChange={(event) => setRequestForm((current) => ({ ...current, district: event.target.value }))}
                                />
                            </label>
                            <label>
                                {t('fields.state')}
                                <input
                                    className="input-field"
                                    value={requestForm.state}
                                    onChange={(event) => setRequestForm((current) => ({ ...current, state: event.target.value }))}
                                />
                            </label>
                        </div>
                        <button className="btn btn-primary" type="submit" disabled={saving}>
                            {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                            {t('common.request_access')}
                        </button>
                    </form>
                </section>

                <section className="glass-card access-card">
                    <div className="access-card-head">
                        <h3><Clock3 size={16} /> {t('access.access_requests')}</h3>
                    </div>
                    {loading ? (
                        <div className="access-loading"><Loader2 size={24} className="spin" /> {t('common.loading')}</div>
                    ) : accessItems.length === 0 ? (
                        <p className="access-empty">{t('access.no_access_requests')}</p>
                    ) : (
                        <div className="access-list">
                            {accessItems.map((item) => (
                                <div key={`${item.farmerPhone}-${item.requestedAt || item.verifiedAt || item.expiresAt}`} className="access-item">
                                    <div className="access-item-top">
                                        <div>
                                            <strong>{item.farmerName || item.farmerPhone}</strong>
                                            <span>{item.farmerPhone}</span>
                                        </div>
                                        <span className={`badge ${statusTone(item.status)}`}>{translateValue(item.status)}</span>
                                    </div>
                                    <div className="access-item-meta">
                                        <span>{t('access.claims_count')}: {item.claimCount || 0}</span>
                                        <span>{t('access.expires')}: {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : '-'}</span>
                                    </div>
                                    {item.status !== 'verified' ? (
                                        <div className="access-verify-row">
                                            <input
                                                className="input-field"
                                                placeholder={t('access.farmer_otp')}
                                                value={otpInputs[item.farmerPhone] || ''}
                                                onChange={(event) => setOtpInputs((current) => ({ ...current, [item.farmerPhone]: event.target.value }))}
                                            />
                                            <button className="btn btn-primary btn-sm" onClick={() => handleVerifyAccess(item.farmerPhone)} disabled={saving}>
                                                {t('common.verify')}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="access-item-actions">
                                            <button className="btn btn-secondary btn-sm" onClick={() => loadFarmerClaims(item)}>
                                                <FolderOpen size={14} />
                                                {t('access.open_claims')}
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleRevokeAccess(item.farmerPhone)}>
                                                <Trash2 size={14} />
                                                {t('common.revoke')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <div className="access-grid lower-grid">
                <section className="glass-card access-card">
                    <div className="access-card-head">
                        <h3><CheckCircle2 size={16} /> {t('access.verified_farmer_claims')}</h3>
                    </div>
                    {!selectedFarmer ? (
                        <p className="access-empty">{t('access.pick_verified_farmer')}</p>
                    ) : (
                        <>
                            <div className="selected-farmer">
                                <div>
                                    <strong>{selectedFarmer.farmerName || selectedFarmer.farmerPhone}</strong>
                                    <span>{selectedFarmer.farmerPhone}</span>
                                </div>
                                <span className="badge badge-green">{t('access.verified')}</span>
                            </div>
                            {farmerClaims.length === 0 ? (
                                <p className="access-empty">{t('access.no_claims_for_farmer')}</p>
                            ) : (
                                <div className="claim-list">
                                    {farmerClaims.map((claim) => (
                                        <div key={claim.claimId} className="claim-list-item">
                                            <div>
                                                <strong>{claim.claimId}</strong>
                                                <span>{claim.cropType ? translateValue(claim.cropType) : '-'} · {claim.village || '-'}</span>
                                            </div>
                                            <div className="claim-list-meta">
                                                <span className={`badge ${statusTone(claim.status === 'Submitted' ? 'pending' : claim.status)}`}>{translateValue(claim.status)}</span>
                                                <span>{claim.completenessScore}% {t('common.complete')}</span>
                                            </div>
                                            <div className="claim-list-actions">
                                                <button className="btn btn-secondary btn-sm" type="button" onClick={() => navigate(`/claims/${claim.claimId}`)}>
                                                    <FolderOpen size={14} />
                                                    {t('claims.open_workspace')}
                                                </button>
                                                {canDiscardClaim(claim) ? (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        type="button"
                                                        onClick={() => handleDiscardClaim(claim)}
                                                        disabled={claimDeletingId === claim.claimId}
                                                    >
                                                        {claimDeletingId === claim.claimId ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                                                        {t('common.delete_draft')}
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </section>

                <section className="glass-card access-card">
                    <div className="access-card-head">
                        <h3><Plus size={16} /> {t('access.start_assisted_claim')}</h3>
                    </div>
                    {!selectedFarmer ? (
                        <p className="access-empty">{t('access.verify_farmer_first')}</p>
                    ) : (
                        <form className="access-form" onSubmit={handleCreateClaim}>
                            <div className="access-form-row">
                                <label>
                                    {t('fields.cropType')}
                                    <select className="select-field" value={claimForm.cropType} onChange={(event) => setClaimForm((current) => ({ ...current, cropType: event.target.value }))}>
                                        <option value="">{t('common.select')}</option>
                                        {cropOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{translateValue(option.value)}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    {t('fields.season')}
                                    <select className="select-field" value={claimForm.season} onChange={(event) => setClaimForm((current) => ({ ...current, season: event.target.value }))}>
                                        <option value="">{t('common.select')}</option>
                                        {seasonOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{translateValue(option.value)}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <div className="access-form-row">
                                <label>
                                    {t('fields.lossDate')}
                                    <input className="input-field" type="date" value={claimForm.lossDate} onChange={(event) => setClaimForm((current) => ({ ...current, lossDate: event.target.value }))} />
                                </label>
                                <label>
                                    {t('fields.cause')}
                                    <select className="select-field" value={claimForm.cause} onChange={(event) => setClaimForm((current) => ({ ...current, cause: event.target.value }))}>
                                        <option value="">{t('common.select')}</option>
                                        {causeOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{translateValue(option.value)}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    {t('fields.areaHectares')}
                                    <input className="input-field" type="number" min="0" step="0.01" value={claimForm.areaHectares} onChange={(event) => setClaimForm((current) => ({ ...current, areaHectares: event.target.value }))} />
                                </label>
                            </div>
                            <div className="access-form-row">
                                <label>
                                    {t('fields.policyType')}
                                    <select className="select-field" value={claimForm.policyType} onChange={(event) => setClaimForm((current) => ({ ...current, policyType: event.target.value }))}>
                                        <option value="">{t('common.select')}</option>
                                        {policyOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{translateValue(option.value)}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    {t('claim.insurer_form')}
                                    <select className="select-field" value={claimForm.selectedTemplateId} onChange={(event) => setClaimForm((current) => ({ ...current, selectedTemplateId: event.target.value }))}>
                                        <option value="">{t('claim.choose_template')}</option>
                                        <option value="sbi">SBI</option>
                                        <option value="icici_lombard">ICICI Lombard</option>
                                    </select>
                                </label>
                            </div>
                            <button className="btn btn-primary" type="submit" disabled={claimSaving}>
                                {claimSaving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                                {t('common.create_claim')}
                            </button>
                        </form>
                    )}
                </section>
            </div>
        </div>
    )
}
