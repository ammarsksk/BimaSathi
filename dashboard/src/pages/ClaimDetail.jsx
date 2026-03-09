import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
    ArrowLeft,
    CheckCircle2,
    FileText,
    Loader2,
    Send,
    ShieldCheck,
    Upload,
    Wand2,
} from 'lucide-react'
import api from '../api/client'
import { useLanguage } from '../context/LanguageContext'
import {
    buildApprovedPhotoSummary,
    buildSchemaDrafts,
    getFieldChoiceOptions,
    validateFieldValue,
} from '../utils/claimSupport'
import './ClaimDetail.css'

const TAB_IDS = [
    'overview',
    'farmer',
    'crop',
    'dateLocation',
    'documents',
    'identity',
    'missing',
    'photos',
    'template',
    'review',
    'timeline',
]

const SECTION_FIELD_CONFIG = {
    farmer: [
        { key: 'farmerName', fieldName: 'farmerName' },
        { key: 'gender', fieldName: 'gender' },
        { key: 'socialCategory', fieldName: 'socialCategory' },
        { key: 'address', fieldName: 'address' },
        { key: 'phoneNumber', fieldName: 'phoneNumber' },
        { key: 'aadhaarNumber', fieldName: 'aadhaarNumber' },
        { key: 'village', fieldName: 'village' },
        { key: 'district', fieldName: 'district' },
        { key: 'state', fieldName: 'state' },
    ],
    crop: [
        { key: 'cropType', fieldName: 'cropType' },
        { key: 'season', fieldName: 'season' },
        { key: 'cause', fieldName: 'cause' },
        { key: 'areaHectares', fieldName: 'areaHectares', fieldType: 'number' },
        { key: 'policyType', fieldName: 'policyType' },
        { key: 'accountType', fieldName: 'accountType' },
        { key: 'hasCropLoanOrKcc', fieldName: 'hasCropLoanOrKcc' },
    ],
    dateLocation: [
        { key: 'lossDate', fieldName: 'lossDate', fieldType: 'date' },
        { key: 'exactLocation', fieldName: 'exactLocation' },
        { key: 'tehsil', fieldName: 'tehsil' },
        { key: 'pinCode', fieldName: 'pinCode' },
        { key: 'notifiedAreaName', fieldName: 'notifiedAreaName' },
    ],
}

function badgeClass(status) {
    if (['Approved', 'Paid'].includes(status)) return 'badge-green'
    if (['Rejected', 'expired', 'revoked'].includes(status)) return 'badge-red'
    if (['Draft', 'Evidence Pending'].includes(status)) return 'badge-orange'
    return 'badge-blue'
}

function initialGroupValues(claim) {
    const values = {}
    Object.values(SECTION_FIELD_CONFIG).flat().forEach((field) => {
        const raw = claim?.[field.key]
        if (raw == null) {
            values[field.key] = ''
        } else if (typeof raw === 'object') {
            values[field.key] = JSON.stringify(raw)
        } else if (typeof raw === 'boolean') {
            values[field.key] = raw ? 'yes' : 'no'
        } else {
            values[field.key] = raw
        }
    })
    return values
}

function buildTabs(t) {
    return TAB_IDS.map((id) => ({ id, label: t(`claim.tabs.${id}`) }))
}

function buildSectionFields(groupId, translateField) {
    return SECTION_FIELD_CONFIG[groupId].map((field) => ({
        ...field,
        label: translateField(field.key),
        options: getFieldChoiceOptions(field.fieldName),
        type: field.fieldType || 'text',
    }))
}

function SectionEditor({ title, fields, values, onChange, onSave, saving, disabled, t, translateValue }) {
    return (
        <div className="workspace-panel">
            <div className="workspace-section-head">
                <div>
                    <h3>{title}</h3>
                    <p>Edit the shared claim fields for this section. Changes are visible to the chatbot immediately.</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || disabled}>
                    {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                    {t('common.save_section')}
                </button>
            </div>
            <div className="form-grid">
                {fields.map((field) => (
                    <label key={field.key} className="workspace-field">
                        <span>{field.label}</span>
                        <div className="workspace-field-input">
                            {field.options.length ? (
                                <select className="select-field" value={values[field.key] ?? ''} onChange={(event) => onChange(field.key, event.target.value)} disabled={disabled}>
                                    <option value="">{t('common.select')}</option>
                                    {field.options.map((option) => (
                                        <option key={option.value} value={option.value}>{translateValue(option.value)}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    className="input-field"
                                    type={field.type}
                                    value={values[field.key] ?? ''}
                                    disabled={disabled}
                                    onChange={(event) => onChange(field.key, event.target.value)}
                                />
                            )}
                        </div>
                    </label>
                ))}
            </div>
        </div>
    )
}

function DocumentList({ documents, emptyLabel }) {
    if (!documents?.length) {
        return <p className="workspace-empty">{emptyLabel}</p>
    }
    return (
        <div className="document-list">
            {documents.map((doc, index) => (
                <a key={`${doc.s3Key || index}-${index}`} href={doc.url} target="_blank" rel="noreferrer" className="document-item">
                    <div>
                        <strong>{doc.type || 'Document'}</strong>
                        <span>{doc.s3Key}</span>
                    </div>
                    <span>{Math.round((doc.sizeBytes || 0) / 1024)} KB</span>
                </a>
            ))}
        </div>
    )
}

function InfoCard({ label, value }) {
    return (
        <div className="info-card">
            <span>{label}</span>
            <strong>{value || '-'}</strong>
        </div>
    )
}

export default function ClaimDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { t, translateField, translateValue } = useLanguage()
    const [activeTab, setActiveTab] = useState('overview')
    const [data, setData] = useState(null)
    const [drafts, setDrafts] = useState({})
    const [schemaDrafts, setSchemaDrafts] = useState({})
    const [loading, setLoading] = useState(true)
    const [savingSection, setSavingSection] = useState('')
    const [uploading, setUploading] = useState('')
    const [templateBusy, setTemplateBusy] = useState(false)
    const [submitBusy, setSubmitBusy] = useState(false)
    const [appealReason, setAppealReason] = useState('')
    const [actionResult, setActionResult] = useState(null)
    const [error, setError] = useState('')

    const tabs = useMemo(() => buildTabs(t), [t])
    const photoSummary = useMemo(
        () => buildApprovedPhotoSummary(data?.photos || [], data?.auditLog || []),
        [data?.photos, data?.auditLog]
    )

    useEffect(() => {
        loadClaim()
    }, [id])

    async function loadClaim() {
        setLoading(true)
        setError('')
        try {
            const result = await api.getOperatorClaim(id)
            applyClaimResult(result)
        } catch (err) {
            setError(err.message || 'Failed to load claim workspace')
        } finally {
            setLoading(false)
        }
    }

    function applyClaimResult(result) {
        setData(result)
        setDrafts(initialGroupValues(result.claim))
        setSchemaDrafts(buildSchemaDrafts(result.pendingFields || [], result.claim || {}, result.farmer || null))
        setAppealReason(result.claim?.rejectionReason || '')
    }

    const claim = data?.claim
    const hasTemplatePending = Boolean((data?.pendingFields || []).length)
    const isClaimLocked = claim ? !['Draft', 'Evidence Pending', 'Late Risk', 'Ready for Submission'].includes(claim.status) : false

    function updateDraft(fieldKey, value) {
        setDrafts((current) => ({ ...current, [fieldKey]: value }))
    }

    async function saveGroup(groupId) {
        const fields = {}
        for (const field of SECTION_FIELD_CONFIG[groupId]) {
            const validation = validateFieldValue({
                fieldName: field.fieldName,
                fieldType: field.fieldType,
                acceptedValues: getFieldChoiceOptions(field.fieldName).map((option) => option.value),
            }, drafts[field.key] ?? '')
            if (!validation.ok) {
                setError(t(validation.errorKey))
                return
            }
            fields[field.key] = validation.value
        }

        setSavingSection(groupId)
        setError('')
        setActionResult(null)
        try {
            const result = await api.updateClaimFields(id, fields)
            applyClaimResult(result)
            setActionResult({ type: 'success', text: t('claim.save_success', { section: t(`claim.tabs.${groupId}`) }) })
        } catch (err) {
            setError(err.message || 'Failed to save section')
        } finally {
            setSavingSection('')
        }
    }

    async function saveSchemaFields() {
        const fields = {}
        for (const field of data?.pendingFields || []) {
            const rawValue = schemaDrafts[field.field_name]
            if (rawValue == null || String(rawValue).trim() === '') continue
            const validation = validateFieldValue({
                fieldName: field.field_name,
                fieldType: field.field_type,
                acceptedValues: getFieldChoiceOptions(field.field_name, field.accepted_values).map((option) => option.value),
            }, rawValue)
            if (!validation.ok) {
                setError(t(validation.errorKey))
                return
            }
            fields[field.field_name] = validation.value
        }

        if (!Object.keys(fields).length) return

        setSavingSection('missing')
        setError('')
        setActionResult(null)
        try {
            const result = await api.updateClaimSchema(id, fields)
            applyClaimResult(result)
            setActionResult({ type: 'success', text: t('claim.missing_saved') })
        } catch (err) {
            setError(err.message || 'Failed to update missing fields')
        } finally {
            setSavingSection('')
        }
    }

    async function handleDocumentUpload(event) {
        const file = event.target.files?.[0]
        if (!file) return
        setUploading('document')
        setError('')
        setActionResult(null)
        try {
            const result = await api.uploadClaimDocument(id, file)
            if (result.accepted === false) {
                setActionResult({ type: 'warning', text: result.reason || t('claim.document_rejected') })
            } else {
                applyClaimResult(result)
                setActionResult({ type: 'success', text: t('claim.document_uploaded') })
            }
        } catch (err) {
            setError(err.message || 'Failed to upload document')
        } finally {
            setUploading('')
            event.target.value = ''
        }
    }

    async function handlePhotoUpload(event) {
        const file = event.target.files?.[0]
        if (!file) return
        setUploading('photo')
        setError('')
        setActionResult(null)
        try {
            const result = await api.uploadClaimPhoto(id, file)
            applyClaimResult(result)
            setActionResult({
                type: result.photoResult?.approved ? 'success' : 'warning',
                text: result.photoResult?.approved ? t('claim.photo_accepted') : (result.photoResult?.failReason || t('claim.photo_rejected')),
            })
        } catch (err) {
            setError(err.message || 'Failed to upload photo')
        } finally {
            setUploading('')
            event.target.value = ''
        }
    }

    async function handleTemplateSelect(templateId) {
        setTemplateBusy(true)
        setError('')
        setActionResult(null)
        try {
            const result = await api.selectTemplate(id, templateId)
            applyClaimResult(result)
            setActionResult({ type: 'success', text: t('claim.template_selected') })
        } catch (err) {
            setError(err.message || 'Failed to select insurer template')
        } finally {
            setTemplateBusy(false)
        }
    }

    async function handleTemplateGenerate() {
        setTemplateBusy(true)
        setError('')
        setActionResult(null)
        try {
            const result = await api.generateTemplate(id)
            setData((current) => ({
                ...current,
                generatedDocuments: {
                    ...(current?.generatedDocuments || {}),
                    insurerFormKey: { key: result.insurerFormKey, url: result.insurerFormUrl },
                },
            }))
            setActionResult({ type: 'success', text: t('claim.template_generated') })
        } catch (err) {
            setError(err.message || 'Failed to generate insurer form')
        } finally {
            setTemplateBusy(false)
        }
    }

    async function handleSubmit() {
        setSubmitBusy(true)
        setError('')
        setActionResult(null)
        try {
            const result = await api.submitClaim(id)
            setActionResult({
                type: 'success',
                text: result.insurerFormUrl
                    ? 'Claim submitted. Claim pack and insurer form are ready.'
                    : 'Claim submitted. Claim pack is ready.',
                links: [
                    result.presignedUrl ? { label: 'Claim pack', url: result.presignedUrl } : null,
                    result.insurerFormUrl ? { label: 'Insurer form', url: result.insurerFormUrl } : null,
                ].filter(Boolean),
            })
            await loadClaim()
        } catch (err) {
            setError(err.message || 'Failed to submit claim')
        } finally {
            setSubmitBusy(false)
        }
    }

    async function handleAppeal() {
        setSubmitBusy(true)
        setError('')
        setActionResult(null)
        try {
            const result = await api.generateAppeal(id, appealReason)
            setActionResult({
                type: 'success',
                text: 'Appeal document generated.',
                links: result.appealUrl ? [{ label: 'Appeal PDF', url: result.appealUrl }] : [],
            })
            await loadClaim()
        } catch (err) {
            setError(err.message || 'Failed to generate appeal')
        } finally {
            setSubmitBusy(false)
        }
    }

    async function handleDeleteDraft() {
        setSubmitBusy(true)
        setError('')
        setActionResult(null)
        try {
            await api.deleteOperatorClaim(id)
            navigate('/claims')
        } catch (err) {
            setError(err.message || 'Failed to delete claim')
        } finally {
            setSubmitBusy(false)
        }
    }

    if (loading) {
        return (
            <div className="dashboard-loading">
                <Loader2 size={32} className="spin" />
                <p>{t('common.loading')}</p>
            </div>
        )
    }

    if (!data || !claim) {
        return <div className="workspace-empty">{error || t('claim.workspace_unavailable')}</div>
    }

    return (
        <div className="workspace-page">
            <div className="workspace-header glass-card">
                <div>
                    <Link to="/claims" className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> {t('common.back_to_claims')}</Link>
                    <h2>{claim.claimId}</h2>
                    <p>{data.farmer?.name || claim.farmerName || 'Farmer'} | {data.farmer?.phoneNumber || claim.phoneNumber || 'No phone'} | {claim.village || 'No village'}</p>
                </div>
                <div className="workspace-header-meta">
                    <span className={`badge ${badgeClass(claim.status)}`}>{translateValue(claim.status)}</span>
                    <div className="workspace-score">
                        <strong>{claim.completenessScore}%</strong>
                        <span>{t('common.complete')}</span>
                    </div>
                    {['Draft', 'Evidence Pending'].includes(claim.status) && (
                        <button className="btn btn-secondary btn-sm" onClick={handleDeleteDraft} disabled={submitBusy}>
                            {t('common.delete_draft')}
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="workspace-alert workspace-alert-error">{error}</div>}
            {isClaimLocked && (
                <div className="workspace-alert workspace-alert-warning">
                    <span>This claim is read-only because it has already been submitted.</span>
                </div>
            )}
            {actionResult && (
                <div className={`workspace-alert ${actionResult.type === 'success' ? 'workspace-alert-success' : 'workspace-alert-warning'}`}>
                    <span>{actionResult.text}</span>
                    {actionResult.links?.length ? (
                        <span className="workspace-alert-links">
                            {actionResult.links.map((link) => (
                                <a key={link.label} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
                            ))}
                        </span>
                    ) : null}
                </div>
            )}

            <div className="workspace-tabs glass-card">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`workspace-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="workspace-body glass-card">
                {activeTab === 'overview' && (
                    <div className="workspace-panel">
                        <div className="workspace-summary-grid">
                            <InfoCard label={t('claim.tabs.farmer')} value={data.farmer?.name || claim.farmerName || '-'} />
                            <InfoCard label={translateField('phoneNumber')} value={data.farmer?.phoneNumber || claim.phoneNumber || '-'} />
                            <InfoCard label={t('claims.crop')} value={claim.cropType ? translateValue(claim.cropType) : '-'} />
                            <InfoCard label={translateField('cause')} value={claim.cause ? translateValue(claim.cause) : '-'} />
                            <InfoCard label={translateField('lossDate')} value={claim.lossDate || '-'} />
                            <InfoCard label={t('claims.deadline')} value={claim.deadline ? new Date(claim.deadline).toLocaleString() : '-'} />
                        </div>
                        <div className="workspace-links">
                            {Object.entries(data.generatedDocuments || {}).map(([key, doc]) => (
                                <a key={key} href={doc.url} target="_blank" rel="noreferrer" className="workspace-link-card">
                                    <FileText size={16} />
                                    <span>{key}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {['farmer', 'crop', 'dateLocation'].includes(activeTab) && (
                    <SectionEditor
                        title={t(`claim.tabs.${activeTab}`)}
                        fields={buildSectionFields(activeTab, translateField)}
                        values={drafts}
                        onChange={updateDraft}
                        onSave={() => saveGroup(activeTab)}
                        saving={savingSection === activeTab}
                        disabled={isClaimLocked}
                        t={t}
                        translateValue={translateValue}
                    />
                )}

                {activeTab === 'documents' && (
                    <div className="workspace-panel">
                        <div className="workspace-section-head">
                            <div>
                                <h3>{t('claim.documents')}</h3>
                                <p>{t('claim.documents_help')}</p>
                            </div>
                            {!isClaimLocked && (
                                <label className="btn btn-primary btn-sm">
                                    <Upload size={14} />
                                    {uploading === 'document' ? t('common.loading') : t('common.upload_document')}
                                    <input type="file" hidden onChange={handleDocumentUpload} />
                                </label>
                            )}
                        </div>
                        <DocumentList documents={data.documents || []} emptyLabel={t('common.no_documents')} />
                    </div>
                )}

                {activeTab === 'identity' && (
                    <div className="workspace-panel">
                        <div className="workspace-section-head">
                            <div>
                                <h3>{t('claim.identity_verification')}</h3>
                                <p>{t('claim.identity_help')}</p>
                            </div>
                        </div>
                        <div className="identity-card">
                            <InfoCard label={t('claim.identity_status')} value={translateValue(data.identityVerification?.status || 'not_verified')} />
                            <InfoCard label={t('claim.claimed_name')} value={data.identityVerification?.claimedName || claim.farmerName || '-'} />
                            <InfoCard label={t('claim.extracted_name')} value={data.identityVerification?.extractedName || '-'} />
                            <InfoCard label={t('claim.source_document')} value={data.identityVerification?.sourceDocumentKey || '-'} />
                        </div>
                    </div>
                )}

                {activeTab === 'missing' && (
                    <div className="workspace-panel">
                        <div className="workspace-section-head">
                            <div>
                                <h3>{t('claim.missing_fields')}</h3>
                                <p>{t('claim.missing_help')}</p>
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={saveSchemaFields} disabled={savingSection === 'missing' || isClaimLocked}>
                                {savingSection === 'missing' ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                                {t('common.save_missing_fields')}
                            </button>
                        </div>
                        {data.pendingFields?.length ? (
                            <div className="schema-grid">
                                {data.pendingFields.map((field) => {
                                    const options = getFieldChoiceOptions(field.field_name, field.accepted_values)
                                    const isChoice = field.field_type === 'choice' || options.length > 0
                                    return (
                                        <label key={field.field_name} className="schema-field">
                                            <span>{translateField(field.field_name, field.field_label)}</span>
                                            {isChoice ? (
                                                <select
                                                    className="select-field"
                                                    value={schemaDrafts[field.field_name] || ''}
                                                    disabled={isClaimLocked}
                                                    onChange={(event) => setSchemaDrafts((current) => ({ ...current, [field.field_name]: event.target.value }))}
                                                >
                                                    <option value="">{t('common.select')}</option>
                                                    {options.map((option) => (
                                                        <option key={option.value} value={option.value}>{translateValue(option.value)}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    className="input-field"
                                                    type={field.field_type === 'date' ? 'date' : field.field_type === 'number' ? 'number' : 'text'}
                                                    value={schemaDrafts[field.field_name] || ''}
                                                    disabled={isClaimLocked}
                                                    onChange={(event) => setSchemaDrafts((current) => ({ ...current, [field.field_name]: event.target.value }))}
                                                />
                                            )}
                                        </label>
                                    )
                                })}
                            </div>
                        ) : (
                            <p className="workspace-empty">{t('common.no_pending_fields')}</p>
                        )}
                    </div>
                )}

                {activeTab === 'photos' && (
                    <div className="workspace-panel">
                        <div className="workspace-section-head">
                            <div>
                                <h3>{t('claim.photo_evidence')}</h3>
                                <p>{t('claim.photo_help')}</p>
                            </div>
                            {!isClaimLocked && (
                                <label className="btn btn-primary btn-sm">
                                    <Upload size={14} />
                                    {uploading === 'photo' ? t('common.loading') : t('common.upload_photo')}
                                    <input type="file" accept="image/*" hidden onChange={handlePhotoUpload} />
                                </label>
                            )}
                        </div>
                        <div className="workspace-photo-note">
                            <span>{t('common.approved_only')}</span>
                            {photoSummary.hiddenRejected > 0 && <span>{t('common.hidden_rejected', { count: photoSummary.hiddenRejected })}</span>}
                        </div>
                        <div className="media-grid">
                            {photoSummary.visible.map((photo) => (
                                <a key={photo.key} href={photo.url} target="_blank" rel="noreferrer" className="media-card">
                                    <img src={photo.url} alt={photo.key} />
                                    <span>{photo.key}</span>
                                </a>
                            ))}
                            {photoSummary.visible.length === 0 && <p className="workspace-empty">{t('common.no_photos')}</p>}
                        </div>
                    </div>
                )}

                {activeTab === 'template' && (
                    <div className="workspace-panel">
                        <div className="workspace-section-head">
                            <div>
                                <h3>{t('claim.insurer_form')}</h3>
                                <p>{t('claim.insurer_help')}</p>
                            </div>
                        </div>
                        <div className="template-actions">
                            <select
                                className="select-field"
                                value={claim.selectedTemplateId || ''}
                                onChange={(event) => handleTemplateSelect(event.target.value)}
                                disabled={templateBusy || isClaimLocked}
                            >
                                <option value="">{t('claim.choose_template')}</option>
                                {(data.templateChoices || []).map((choice) => (
                                    <option key={choice.value} value={choice.value}>{choice.title}</option>
                                ))}
                            </select>
                            <button className="btn btn-primary btn-sm" onClick={handleTemplateGenerate} disabled={!claim.selectedTemplateId || templateBusy || hasTemplatePending || isClaimLocked}>
                                {templateBusy ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}
                                {t('common.generate_form')}
                            </button>
                        </div>
                        {hasTemplatePending && (
                            <div className="workspace-photo-note">
                                <span>Review and save the Missing Fields section before generating the insurer form.</span>
                            </div>
                        )}
                        <div className="workspace-links">
                            {Object.entries(data.generatedDocuments || {}).map(([key, doc]) => (
                                <a key={key} href={doc.url} target="_blank" rel="noreferrer" className="workspace-link-card">
                                    <FileText size={16} />
                                    <span>{key}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'review' && (
                    <div className="workspace-panel">
                        <div className="workspace-summary-grid">
                            <InfoCard label={t('claim.review_pending_fields')} value={String((data.pendingFields || []).length)} />
                            <InfoCard label={t('claim.review_documents')} value={String((data.documents || []).length)} />
                            <InfoCard label={t('claim.review_photos')} value={String(photoSummary.visible.length)} />
                            <InfoCard label={t('claim.review_identity')} value={translateValue(data.identityVerification?.status || 'not_verified')} />
                        </div>
                        <div className="review-actions">
                            <button className="btn btn-primary btn-md submit-claim-btn" onClick={handleSubmit} disabled={submitBusy || hasTemplatePending || isClaimLocked}>
                                {submitBusy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                                {t('common.submit_claim')}
                            </button>
                            {claim.status === 'Rejected' && (
                                <div className="appeal-box">
                                    <textarea
                                        className="input-field"
                                        rows={4}
                                        value={appealReason}
                                        onChange={(event) => setAppealReason(event.target.value)}
                                        placeholder={t('claim.appeal_reason')}
                                    />
                                    <button className="btn btn-secondary" onClick={handleAppeal} disabled={submitBusy}>
                                        {submitBusy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
                                        {t('common.generate_appeal')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'timeline' && (
                    <div className="workspace-panel">
                        <div className="workspace-summary-grid">
                            <InfoCard label={t('claims.status')} value={translateValue(claim.status)} />
                            <InfoCard label={t('claim.submitted_by_operator')} value={claim.submittedByOperator || '-'} />
                            <InfoCard label={t('claim.submitted_at')} value={claim.submittedAt || '-'} />
                            <InfoCard label={t('claims.deadline')} value={claim.deadline || '-'} />
                        </div>
                        <div className="audit-list">
                            {(data.auditLog || []).map((entry, index) => (
                                <div key={`${entry.timestamp || index}-${entry.action}`} className="audit-item">
                                    <div className="audit-bullet" />
                                    <div>
                                        <strong>{entry.action}</strong>
                                        <span>{entry.actor} | {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '-'}</span>
                                    </div>
                                </div>
                            ))}
                            {(!data.auditLog || data.auditLog.length === 0) && <p className="workspace-empty">{t('common.no_audit')}</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
