import { normalizeSession } from '../utils/session'
const API_BASE = import.meta.env.VITE_API_URL || '/api'

function getSession() {
    const token = sessionStorage.getItem('bms_token')
    const rawUser = sessionStorage.getItem('bms_user')
    let user = null
    if (rawUser) {
        try {
            user = JSON.parse(rawUser)
        } catch {
            user = null
        }
    }
    const normalized = normalizeSession({ token, user })
    if (normalized.user && rawUser !== JSON.stringify(normalized.user)) {
        sessionStorage.setItem('bms_user', JSON.stringify(normalized.user))
    }
    return normalized
}

function operatorHeaders() {
    const { token, user } = getSession()
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(user?.phoneNumber ? { 'X-Operator-Phone': user.phoneNumber } : {}),
        ...(user?.name ? { 'X-Operator-Name': user.name } : {}),
        ...(user?.role ? { 'X-Operator-Role': user.role } : {}),
    }
}

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            ...operatorHeaders(),
            ...(options.headers || {}),
        },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(payload.error || `API error ${response.status}`)
    }
    return payload
}

function buildQuery(filters = {}) {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
        if (value == null || value === '') return
        params.set(key, String(value))
    })
    const qs = params.toString()
    return qs ? `?${qs}` : ''
}

async function fileToPayload(file) {
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
    })

    return {
        name: file.name,
        contentType: file.type || 'application/octet-stream',
        base64,
    }
}

async function sendOtp(phoneNumber, role = 'operator') {
    return request('/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'send_otp', phoneNumber, role }),
    })
}

async function verifyOtp(phoneNumber, code, role = 'operator') {
    return request('/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'verify_otp', phoneNumber, code, role }),
    })
}

async function getAccessScope() {
    return request('/operator/access')
}

async function requestFarmerAccess(data) {
    return request('/operator/access/request', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}

async function verifyFarmerAccess(data) {
    return request('/operator/access/verify', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}

async function revokeFarmerAccess(data) {
    return request('/operator/access/revoke', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}

async function getAccessibleFarmers() {
    return request('/operator/farmers')
}

async function getFarmerClaims(phoneNumber) {
    return request(`/operator/farmers/${encodeURIComponent(phoneNumber)}/claims`)
}

async function getOperatorClaims(filters = {}) {
    return request(`/operator/claims${buildQuery(filters)}`)
}

async function createOperatorClaim(data) {
    return request('/operator/claims', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}

async function getOperatorClaim(claimId) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}`)
}

async function deleteOperatorClaim(claimId) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}`, {
        method: 'DELETE',
    })
}

async function updateClaimFields(claimId, fields) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}/fields`, {
        method: 'PATCH',
        body: JSON.stringify({
            fields,
        }),
    })
}

async function updateClaimSchema(claimId, fields) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}/schema`, {
        method: 'PATCH',
        body: JSON.stringify({
            fields,
        }),
    })
}

async function uploadClaimDocument(claimId, file) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}/documents`, {
        method: 'POST',
        body: JSON.stringify({
            file: await fileToPayload(file),
        }),
    })
}

async function uploadClaimPhoto(claimId, file) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}/photos`, {
        method: 'POST',
        body: JSON.stringify({
            file: await fileToPayload(file),
        }),
    })
}

async function selectTemplate(claimId, templateId) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}/template/select`, {
        method: 'POST',
        body: JSON.stringify({ templateId }),
    })
}

async function generateTemplate(claimId) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}/template/generate`, {
        method: 'POST',
    })
}

async function submitClaim(claimId) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}/submit`, {
        method: 'POST',
    })
}

async function generateAppeal(claimId, rejectionReason) {
    return request(`/operator/claims/${encodeURIComponent(claimId)}/appeal`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason }),
    })
}

async function getAnalytics() {
    return request('/analytics')
}

async function safeAnalytics() {
    try {
        return await getAnalytics()
    } catch {
        return {
            totalClaims: 0,
            byStatus: {},
            byCrop: {},
            avgCompleteness: 0,
            pendingSubmission: 0,
            due24Hours: 0,
            accessibleFarmers: 0,
            dailyCounts: {},
            rejectionReasons: {},
        }
    }
}

async function createFarmer(data) {
    return request('/farmers', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}

async function safeDashboardBootstrap() {
    try {
        const [analytics, access] = await Promise.all([
            getAnalytics(),
            getAccessScope(),
        ])
        return { analytics, access: access.access || [] }
    } catch {
        return {
            analytics: {
                totalClaims: 0,
                byStatus: {},
                byCrop: {},
                avgCompleteness: 0,
                pendingSubmission: 0,
                due24Hours: 0,
                accessibleFarmers: 0,
            },
            access: [],
        }
    }
}

export default {
    sendOtp,
    verifyOtp,
    getAccessScope,
    requestFarmerAccess,
    verifyFarmerAccess,
    revokeFarmerAccess,
    getAccessibleFarmers,
    getFarmerClaims,
    getOperatorClaims,
    createOperatorClaim,
    getOperatorClaim,
    deleteOperatorClaim,
    updateClaimFields,
    updateClaimSchema,
    uploadClaimDocument,
    uploadClaimPhoto,
    selectTemplate,
    generateTemplate,
    submitClaim,
    generateAppeal,
    getAnalytics,
    safeAnalytics,
    createFarmer,
    safeDashboardBootstrap,
}
