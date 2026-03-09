import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
    MessageCircle, Shield, Clock, Camera, FileText,
    ArrowRight, Play, CheckCircle2, Award, Menu, X,
    Bot, Database, Cloud, Cpu, Eye, Volume2, Workflow, Lock,
    Layers, Globe, Zap, ChevronDown, Check
} from 'lucide-react'
import './Landing.css'

/* ═══════════════════════════════════════
   Utilities
   ═══════════════════════════════════════ */

function useGlobalReveal() {
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(e => {
                if (e.isIntersecting) e.target.classList.add('visible')
            }),
            { threshold: 0.08, rootMargin: '0px 0px -50px 0px' }
        )
        document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(el => observer.observe(el))
        return () => observer.disconnect()
    }, [])
}

function AnimatedCounter({ value, suffix = '', prefix = '' }) {
    const [display, setDisplay] = useState(0)
    const ref = useRef(null)
    const started = useRef(false)
    const num = parseInt(value, 10)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const observer = new IntersectionObserver(([e]) => {
            if (e.isIntersecting && !started.current) {
                started.current = true
                const duration = 1200
                const start = performance.now()
                const tick = (now) => {
                    const t = Math.min((now - start) / duration, 1)
                    const ease = 1 - Math.pow(1 - t, 3)
                    setDisplay(Math.floor(ease * num))
                    if (t < 1) requestAnimationFrame(tick)
                }
                requestAnimationFrame(tick)
            }
        }, { threshold: 0.3 })
        observer.observe(el)
        return () => observer.disconnect()
    }, [num])

    return <span ref={ref}>{prefix}{isNaN(num) ? value : display}{suffix}</span>
}

/* ═══════════════════════════════════════
   WhatsApp Demo
   ═══════════════════════════════════════ */

const CHAT = [
    { from: 'bot', text: 'Namaste! Main BimaSathi hun 🌾\nAapki fasal bima claim mein madad karunga.', time: '2:10 PM' },
    { from: 'user', text: 'Meri gehun ki fasal barbaad ho gayi baarish se', time: '2:11 PM' },
    { from: 'bot', text: 'Yeh sunke dukh hua 🙏 Aap kaunse gaon se hain?', time: '2:11 PM' },
    { from: 'user', text: '📍 Kamptee, Nagpur', time: '2:12 PM' },
    { from: 'bot', text: '✅ Location verified.\nAb apne khet ki 3 photos bhejein.', time: '2:12 PM' },
    { from: 'user', text: '📷 [3 Photos sent]', time: '2:14 PM' },
    { from: 'bot', text: '✅ All photos verified — damage confirmed.\n📄 Claim Pack generated. Filing now...', time: '2:14 PM' },
]

function WhatsAppDemo() {
    const [visible, setVisible] = useState(0)
    const chatRef = useRef(null)

    useEffect(() => {
        const timers = CHAT.map((_, i) => setTimeout(() => setVisible(i + 1), 800 + i * 1400))
        return () => timers.forEach(clearTimeout)
    }, [])

    useEffect(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
    }, [visible])

    return (
        <div className="wa-phone">
            <div className="wa-statusbar"><span>9:41</span><span className="wa-sr">📶 🔋</span></div>
            <div className="wa-header">
                <div className="wa-back">←</div>
                <div className="wa-avatar-wrap">
                    <div className="wa-avatar">B</div>
                    <span className="wa-online" />
                </div>
                <div>
                    <div className="wa-name">BimaSathi</div>
                    <div className="wa-typing-label">{visible < CHAT.length ? 'typing…' : 'online'}</div>
                </div>
            </div>
            <div className="wa-chat" ref={chatRef}>
                {CHAT.slice(0, visible).map((m, i) => (
                    <div key={i} className={`wa-msg ${m.from}`}>
                        <span className="wa-msg-text">{m.text}</span>
                        <span className="wa-time">{m.time}</span>
                    </div>
                ))}
                {visible < CHAT.length && <div className="wa-typing"><span /><span /><span /></div>}
            </div>
            <div className="wa-input-bar">
                <div className="wa-input-fake">Type a message</div>
                <div className="wa-mic-btn"><MessageCircle size={18} /></div>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════
   Architecture Flowchart (Animated)
   ═══════════════════════════════════════ */

const FLOW_NODES = [
    { id: 'farmer', label: 'Farmer', sub: 'WhatsApp', icon: '👨‍🌾', col: 0, row: 0, color: '#25D366' },
    { id: 'twilio', label: 'Twilio', sub: 'WhatsApp API', col: 1, row: 0, color: '#F22F46' },
    { id: 'apigw', label: 'API Gateway', sub: 'REST + WebSocket', col: 2, row: 0, color: '#FF9900' },
    { id: 'lambda', label: 'Lambda', sub: '10 Functions', col: 3, row: 0, color: '#FF9900' },
    { id: 'bedrock', label: 'Bedrock', sub: 'Claude 3 Sonnet', col: 1, row: 1, color: '#7C3AED' },
    { id: 'rekognition', label: 'Rekognition', sub: 'Damage Detection', col: 2, row: 1, color: '#2563EB' },
    { id: 'transcribe', label: 'Transcribe', sub: '6 Languages', col: 3, row: 1, color: '#06B6D4' },
    { id: 'polly', label: 'Polly', sub: 'Response Engine', col: 4, row: 1, color: '#10B981' },
    { id: 'stepfn', label: 'Step Functions', sub: 'Orchestration', col: 0, row: 2, color: '#EC4899' },
    { id: 'dynamo', label: 'DynamoDB', sub: '6 Tables', col: 2, row: 2, color: '#2563EB' },
    { id: 's3', label: 'S3 + KMS', sub: 'Encrypted Storage', col: 4, row: 2, color: '#EF4444' },
    { id: 'eventbridge', label: 'EventBridge', sub: 'Reminders', col: 1, row: 3, color: '#F59E0B' },
    { id: 'dashboard', label: 'Dashboard', sub: 'React Web App', col: 3, row: 3, color: '#10B981' },
]

const FLOW_EDGES = [
    ['farmer', 'twilio'], ['twilio', 'apigw'], ['apigw', 'lambda'],
    ['lambda', 'bedrock'], ['lambda', 'rekognition'], ['lambda', 'transcribe'], ['lambda', 'polly'],
    ['lambda', 'stepfn'], ['lambda', 'dynamo'], ['lambda', 's3'],
    ['stepfn', 'eventbridge'], ['dynamo', 'dashboard'],
    ['bedrock', 'dynamo'], ['rekognition', 'dynamo'],
]

function ArchFlowchart() {
    const [active, setActive] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) setActive(true)
        }, { threshold: 0.2 })
        obs.observe(el)
        return () => obs.disconnect()
    }, [])

    const nodeW = 110, nodeH = 56
    const colW = 180, rowH = 120, padX = nodeW / 2 + 24, padY = nodeH / 2 + 24
    const maxCol = Math.max(...FLOW_NODES.map(n => n.col))
    const maxRow = Math.max(...FLOW_NODES.map(n => n.row))
    const svgW = padX * 2 + maxCol * colW
    const svgH = padY * 2 + maxRow * rowH

    const getPos = (id) => {
        const n = FLOW_NODES.find(n => n.id === id)
        if (!n) return { x: 0, y: 0 }
        return { x: padX + n.col * colW, y: padY + n.row * rowH }
    }

    return (
        <div className={`arch-flowchart ${active ? 'active' : ''}`} ref={ref}>
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="arch-svg">
                <defs>
                    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="rgba(37,99,235,0.5)" />
                    </marker>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>
                {FLOW_EDGES.map(([from, to], i) => {
                    const a = getPos(from), b = getPos(to)
                    return (
                        <g key={i} className="flow-edge" style={{ animationDelay: `${i * 0.15}s` }}>
                            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(0,0,0,0.06)" strokeWidth="1.5" />
                            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(37,99,235,0.25)" strokeWidth="1.5" strokeDasharray="6 4" className="edge-dash" markerEnd="url(#arrowhead)" />
                            <circle r="3" fill="#2563EB" filter="url(#glow)" className="data-packet">
                                <animateMotion dur={`${1.5 + Math.random()}s`} repeatCount="indefinite" begin={`${i * 0.3}s`}>
                                    <mpath xlinkHref={`#path-${i}`} />
                                </animateMotion>
                            </circle>
                            <path id={`path-${i}`} d={`M${a.x},${a.y} L${b.x},${b.y}`} fill="none" />
                        </g>
                    )
                })}
                {FLOW_NODES.map((n, i) => {
                    const pos = getPos(n.id)
                    return (
                        <g key={n.id} className="flow-node" style={{ animationDelay: `${i * 0.08}s` }}>
                            <rect x={pos.x - 55} y={pos.y - 28} width="110" height="56" rx="12" fill="white" stroke={n.color} strokeWidth="1.5" strokeOpacity="0.4" className="node-rect" />
                            <rect x={pos.x - 55} y={pos.y - 28} width="110" height="56" rx="12" fill="none" stroke={n.color} strokeWidth="1" strokeOpacity="0.1" className="node-glow" />
                            {n.icon && <text x={pos.x} y={pos.y - 4} textAnchor="middle" fontSize="18">{n.icon}</text>}
                            <text x={pos.x} y={n.icon ? pos.y + 14 : pos.y - 2} textAnchor="middle" fill="#0F172A" fontSize="10.5" fontWeight="700" fontFamily="'Inter', sans-serif">{n.label}</text>
                            <text x={pos.x} y={n.icon ? pos.y + 24 : pos.y + 12} textAnchor="middle" fill="#94A3B8" fontSize="8" fontWeight="500">{n.sub}</text>
                        </g>
                    )
                })}
            </svg>
            <div className="flow-legend">
                <span className="flow-legend-item"><span className="legend-dot" style={{ background: '#25D366' }} /> Entry</span>
                <span className="flow-legend-item"><span className="legend-dot" style={{ background: '#FF9900' }} /> AWS Core</span>
                <span className="flow-legend-item"><span className="legend-dot" style={{ background: '#7C3AED' }} /> AI/ML</span>
                <span className="flow-legend-item"><span className="legend-dot" style={{ background: '#2563EB' }} /> Data</span>
                <span className="flow-legend-item"><span className="legend-dot" style={{ background: '#10B981' }} /> Output</span>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════
   Static Data
   ═══════════════════════════════════════ */

const FEATURES = [
    { icon: MessageCircle, title: 'WhatsApp Native', desc: 'No app install needed. Works on any phone with WhatsApp — farmers message, we handle everything.', color: '#25D366', span: true },
    { icon: Bot, title: 'Guided Claim Intake', desc: 'Step-by-step prompts collect the right claim details on WhatsApp without making farmers learn a new workflow.', color: '#2563EB', span: true },
    { icon: Camera, title: 'Smart Evidence', desc: 'Rekognition verifies crop damage, validates GPS, and checks timestamps automatically.', color: '#F59E0B' },
    { icon: FileText, title: 'Auto Docs', desc: 'Claim Form + Evidence Report + Cover Letter generated as PDFs in under 60 seconds.', color: '#7C3AED' },
    { icon: Clock, title: 'Deadline Guardian', desc: 'Reminders at 48h, 24h, 6h, and 1h. Farmers never miss the 72-hour PMFBY window.', color: '#EF4444' },
    { icon: Shield, title: 'Tamper-Proof', desc: 'SHA-256 hashed photos with EXIF and GPS stored immutably. Insurers cannot dispute.', color: '#06B6D4' },
]

const STEPS = [
    { num: '1', title: 'Message BimaSathi', desc: 'Farmer opens WhatsApp and says "Meri fasal barbaad ho gayi." No registration needed.', icon: MessageCircle },
    { num: '2', title: 'Guided Intake', desc: 'AI asks one question at a time — crop, village, loss date — in the farmer\'s language.', icon: Bot },
    { num: '3', title: 'Photo Evidence', desc: 'AI guides 3 photos: wide, angle, close-up. Each verified for quality, GPS, and damage.', icon: Camera },
    { num: '4', title: 'Claim Filed', desc: 'Complete Claim Pack PDF sent via WhatsApp. Auto-submitted to PMFBY portal.', icon: CheckCircle2 },
]

const METRICS = [
    { value: '15', suffix: ' min', label: 'End-to-end claim time', prefix: '<' },
    { value: '80', suffix: '%+', label: 'Submission success rate' },
    { value: '6', suffix: '', label: 'Indian languages supported' },
    { value: '0', suffix: '', label: 'App downloads needed' },
]

const COMPARISONS = [
    { name: 'PMFBY Portal', effort: 'High', success: 'Low', channel: 'Web', highlight: false },
    { name: 'Advisory Apps', effort: 'Medium', success: 'Medium', channel: 'Mobile App', highlight: false },
    { name: 'Insurance Agent', effort: 'Low', success: 'Medium', channel: 'In-person', highlight: false },
    { name: 'BimaSathi', effort: 'Low', success: 'High', channel: 'WhatsApp', highlight: true },
]

/* ═══════════════════════════════════════
   Main Component
   ═══════════════════════════════════════ */

export default function Landing() {
    const [mobileMenu, setMobileMenu] = useState(false)
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 20)
        window.addEventListener('scroll', handler, { passive: true })
        return () => window.removeEventListener('scroll', handler)
    }, [])

    useGlobalReveal()

    return (
        <div className="landing">
            {/* ── Nav ── */}
            <nav className={`nav ${scrolled ? 'nav-scrolled' : ''}`}>
                <div className="container nav-inner">
                    <Link to="/" className="nav-logo">
                        <span className="nav-logo-icon">🌾</span>
                        <span className="nav-logo-text">BimaSathi</span>
                    </Link>
                    <div className={`nav-links ${mobileMenu ? 'open' : ''}`}>
                        <a href="#problem" onClick={() => setMobileMenu(false)}>Problem</a>
                        <a href="#solution" onClick={() => setMobileMenu(false)}>Solution</a>
                        <a href="#how-it-works" onClick={() => setMobileMenu(false)}>How It Works</a>
                        <a href="#architecture" onClick={() => setMobileMenu(false)}>Architecture</a>
                        <Link to="/login" className="btn btn-primary btn-sm" onClick={() => setMobileMenu(false)}>Open Dashboard</Link>
                    </div>
                    <button className="nav-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu">
                        {mobileMenu ? <X size={22} /> : <Menu size={22} />}
                    </button>
                </div>
            </nav>

            {/* ── Hero — Cluely style: centered, serif, ambient bg ── */}
            <section className="hero" id="hero">
                <div className="hero-ambient" />
                <div className="hero-ambient-2" />
                <div className="container hero-content">
                    <div className="hero-center">
                        <div className="hero-badge reveal">
                            <Award size={14} /> AWS AI for Bharat Hackathon · Team Rayquaza EX
                        </div>
                        <h1 className="hero-title reveal">
                            The #1 AI Agent for<br />Crop Insurance Claims
                        </h1>
                        <p className="hero-subtitle reveal">
                            BimaSathi automates the entire claim journey on WhatsApp — from loss reporting
                            to insurer submission — in under 15 minutes with guided claim intake.
                        </p>
                        <div className="hero-cta reveal">
                            <a href="#how-it-works" className="btn btn-primary btn-lg"><Play size={16} /> See How It Works</a>
                            <Link to="/dashboard" className="btn btn-secondary btn-lg">Open Dashboard <ArrowRight size={16} /></Link>
                        </div>
                        <div className="hero-proof reveal">
                            {['No app download required', 'Step-by-step guided filing', 'PMFBY-compliant claim packs'].map((t, i) => (
                                <span key={i} className="hero-proof-item"><Check size={14} /> {t}</span>
                            ))}
                        </div>
                    </div>
                    <div className="hero-demo reveal-scale">
                        <WhatsAppDemo />
                    </div>
                </div>
            </section>

            {/* ── Metrics ── */}
            <section className="metrics-strip">
                <div className="container metrics-grid stagger-children">
                    {METRICS.map((m, i) => (
                        <div key={i} className="metric-item reveal">
                            <span className="metric-value">
                                <AnimatedCounter value={m.value} suffix={m.suffix} prefix={m.prefix || ''} />
                            </span>
                            <span className="metric-label">{m.label}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Problem ── */}
            <section className="section" id="problem">
                <div className="container">
                    <div className="section-header reveal">
                        <span className="section-eyebrow">The Problem</span>
                        <h2 className="section-title">Farmers have insurance.<br />Claims fail at execution.</h2>
                        <p className="section-desc">
                            87% of crop insurance claims fail not because farmers lack coverage, but because
                            the claims process is broken. BimaSathi fixes the execution layer.
                        </p>
                    </div>
                    <div className="problem-grid stagger-children">
                        {[
                            { icon: Clock, title: 'Filed Too Late', desc: 'PMFBY requires claims within 72 hours. Most farmers don\'t know the deadline exists.', color: '#EF4444' },
                            { icon: Camera, title: 'Incomplete Evidence', desc: 'Blurry photos, missing GPS, no timestamps. 60%+ claims rejected on first submission.', color: '#F59E0B' },
                            { icon: FileText, title: 'Zero Follow-Up', desc: 'No tracking, no reminders, no one to call. Claims sit in limbo until farmers give up.', color: '#2563EB' },
                        ].map((p, i) => (
                            <div key={i} className="glass-card problem-card reveal">
                                <div className="problem-icon" style={{ color: p.color, background: `${p.color}0D` }}><p.icon size={24} /></div>
                                <h3>{p.title}</h3>
                                <p>{p.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Solution — Bento Grid ── */}
            <section className="section section-alt" id="solution">
                <div className="container">
                    <div className="section-header reveal">
                        <span className="section-eyebrow">Our Solution</span>
                        <h2 className="section-title">End-to-end claim automation<br />on WhatsApp.</h2>
                        <p className="section-desc">
                            Every capability a farmer needs to file a complete, submission-ready insurance
                            claim — accessible through the app they already use every day.
                        </p>
                    </div>
                    <div className="bento-grid stagger-children">
                        {FEATURES.map((f, i) => (
                            <div key={i} className={`glass-card bento-card reveal ${f.span ? 'bento-span' : ''}`}>
                                <div className="bento-icon" style={{ color: f.color, background: `${f.color}0D` }}><f.icon size={22} /></div>
                                <h3>{f.title}</h3>
                                <p>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── How It Works ── */}
            <section className="section" id="how-it-works">
                <div className="container">
                    <div className="section-header reveal">
                        <span className="section-eyebrow">User Journey</span>
                        <h2 className="section-title">From crop loss to filed claim<br />in 4 simple steps.</h2>
                    </div>
                    <div className="steps-row stagger-children">
                        {STEPS.map((s, i) => (
                            <div key={i} className="step-card reveal">
                                <div className="step-num">{s.num}</div>
                                <div className="step-icon-wrap" style={{ color: '#2563EB' }}><s.icon size={22} /></div>
                                <h3>{s.title}</h3>
                                <p>{s.desc}</p>
                                {i < STEPS.length - 1 && <div className="step-arrow"><ArrowRight size={16} /></div>}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Personas ── */}
            <section className="section section-alt" id="personas">
                <div className="container">
                    <div className="section-header reveal">
                        <span className="section-eyebrow">Platform Users</span>
                        <h2 className="section-title">Three users, one unified platform.</h2>
                    </div>
                    <div className="personas-grid stagger-children">
                        {[
                            {
                                emoji: '👨‍🌾', role: 'Farmer', channel: 'WhatsApp', desc: 'Files claims through guided chat and photos on WhatsApp. Zero literacy barriers.',
                                features: ['Guided claim filing', 'AI-guided photo capture', 'Automatic deadline reminders', 'Real-time status updates']
                            },
                            {
                                emoji: '🤝', role: 'Helper', channel: 'WhatsApp', desc: 'A family member or CSC volunteer who files claims on behalf of farmers via OTP consent.',
                                features: ['Consent-based delegation', 'File on behalf of farmers', 'Upload linked evidence', 'Receive all status updates']
                            },
                            {
                                emoji: '💼', role: 'Operator', channel: 'Web Dashboard', desc: 'CSC/FPO agent managing hundreds of farmer claims through a professional dashboard.',
                                features: ['Claims queue by urgency', 'Evidence validation + PDF', 'Direct insurer submission', 'Analytics and reporting']
                            },
                        ].map((p, i) => (
                            <div key={i} className="glass-card persona-card reveal">
                                <div className="persona-header">
                                    <span className="persona-emoji">{p.emoji}</span>
                                    <div><h3>{p.role}</h3><span className="persona-channel">{p.channel}</span></div>
                                </div>
                                <p className="persona-desc">{p.desc}</p>
                                <ul className="persona-list">
                                    {p.features.map((f, j) => <li key={j}><Check size={14} /> {f}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Architecture Flowchart ── */}
            <section className="section" id="architecture">
                <div className="container">
                    <div className="section-header reveal">
                        <span className="section-eyebrow">AWS Architecture</span>
                        <h2 className="section-title">Built entirely on AWS —<br />production-grade from day one.</h2>
                        <p className="section-desc">
                            Watch data flow from the farmer's WhatsApp message through our serverless pipeline.
                        </p>
                    </div>
                    <div className="reveal-scale"><ArchFlowchart /></div>
                </div>
            </section>

            {/* ── Comparison ── */}
            <section className="section section-alt" id="compare">
                <div className="container">
                    <div className="section-header reveal">
                        <span className="section-eyebrow">Market Position</span>
                        <h2 className="section-title">The only low-effort,<br />high-success solution.</h2>
                    </div>
                    <div className="compare-wrap reveal-scale">
                        <table className="compare-table">
                            <thead><tr><th>Solution</th><th>Farmer Effort</th><th>Claim Success</th><th>Channel</th></tr></thead>
                            <tbody>
                                {COMPARISONS.map((c, i) => (
                                    <tr key={i} className={c.highlight ? 'row-highlight' : ''}>
                                        <td className="compare-name">{c.name}</td>
                                        <td><span className={`compare-level ${c.effort === 'Low' ? 'level-good' : c.effort === 'Medium' ? 'level-mid' : 'level-bad'}`}>{c.effort}</span></td>
                                        <td><span className={`compare-level ${c.success === 'High' ? 'level-good' : c.success === 'Medium' ? 'level-mid' : 'level-bad'}`}>{c.success}</span></td>
                                        <td className="compare-channel">{c.channel}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className="cta-section" id="cta">
                <div className="cta-ambient" />
                <div className="container">
                    <div className="cta-content reveal-scale">
                        <h2>Ready to see BimaSathi<br />in action?</h2>
                        <p>Explore the operator dashboard or message us on WhatsApp to experience the farmer journey.</p>
                        <div className="cta-actions">
                            <Link to="/dashboard" className="btn btn-primary btn-lg">Open Dashboard <ArrowRight size={16} /></Link>
                            <a href="https://wa.me/" target="_blank" rel="noopener" className="btn btn-secondary btn-lg"><MessageCircle size={16} /> Try on WhatsApp</a>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="footer">
                <div className="container footer-inner">
                    <div className="footer-left">
                        <div className="footer-brand"><span>🌾</span><span className="footer-brand-text">BimaSathi</span></div>
                        <p className="footer-tagline">Instant, guided, trusted by design.</p>
                        <p className="footer-copy">© 2025 Team Rayquaza EX · AWS AI for Bharat Hackathon</p>
                    </div>
                    <div className="footer-links-grid">
                        <div className="footer-col"><h4>Product</h4><a href="#problem">Problem</a><a href="#solution">Solution</a><a href="#how-it-works">How It Works</a></div>
                        <div className="footer-col"><h4>Platform</h4><Link to="/login">Operator Login</Link><Link to="/dashboard">Dashboard</Link><Link to="/analytics">Analytics</Link></div>
                        <div className="footer-col"><h4>Architecture</h4><a href="#architecture">Tech Stack</a><a href="#compare">Comparison</a><span>Serverless on AWS</span></div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
