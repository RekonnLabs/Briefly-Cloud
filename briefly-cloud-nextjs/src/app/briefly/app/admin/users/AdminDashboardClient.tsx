// @ts-nocheck — pending type cleanup
'use client'

import { useState } from 'react'
import { Users, FileText, MessageSquare, TrendingUp, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react'

interface UserProfile {
  id: string
  email: string
  full_name: string | null
  subscription_tier: string
  subscription_status: string
  trial_end_date: string | null
  stripe_customer_id: string | null
  created_at: string
}

interface UserLimit {
  user_id: string
  email: string
  effective_tier: string
  is_trial_active: boolean
  trial_days_remaining: number
  files_used: number
  files_limit: number
  storage_used_mb: string
  chat_messages_used: number
  chat_messages_limit: number
}

interface Message {
  owner_id: string
  role: string
  content: string
  created_at: string
  provenance: any
  intent_mode: string | null
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | null
  tokens_context: number | null
  latency_ms: number | null
}

interface FileRecord {
  owner_id: string
  name: string
  processing_status: string
  created_at: string
  source: string
}

interface Props {
  users: UserProfile[]
  limits: UserLimit[]
  recentMessages: Message[]
  assistantMessages: Message[]
  files: FileRecord[]
}

export default function AdminDashboardClient({ users, limits, recentMessages, assistantMessages, files }: Props) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'activity' | 'performance'>('overview')

  const limitsMap = Object.fromEntries(limits.map(l => [l.user_id, l]))
  const userMessages = (userId: string) => recentMessages.filter(m => m.owner_id === userId)
  const userFiles = (userId: string) => files.filter(f => f.owner_id === userId)

  const totalFiles = limits.reduce((s, l) => s + (l.files_used || 0), 0)
  const totalMessages = limits.reduce((s, l) => s + (l.chat_messages_used || 0), 0)
  const paidUsers = users.filter(u => u.subscription_tier === 'pro' && u.subscription_status === 'active').length
  const trialUsers = limits.filter(l => l.is_trial_active).length

  const tierColor = (tier: string, trial: boolean) => {
    if (tier === 'pro' && !trial) return 'bg-green-500/20 text-green-400 border border-green-500/30'
    if (trial) return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
    return 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
  }

  const provenanceColor = (p: any) => {
    if (!p) return 'text-gray-500'
    if (p.type === 'grounded') return 'text-green-400'
    if (p.type === 'general') return 'text-blue-400'
    return 'text-yellow-400'
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Briefly Admin</h1>
          <p className="text-gray-400 text-sm mt-1">Internal dashboard — do not share</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/30 border border-red-700/40 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-red-300 text-xs font-medium">Admin Access Only</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Users', value: users.length, icon: Users, color: 'blue' },
          { label: 'Paying (Pro)', value: paidUsers, icon: TrendingUp, color: 'green' },
          { label: 'On Trial', value: trialUsers, icon: Clock, color: 'yellow' },
          { label: 'Files Indexed', value: totalFiles, icon: FileText, color: 'purple' },
          { label: 'Total Messages', value: totalMessages, icon: MessageSquare, color: 'indigo' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 text-${color}-400`} />
              <span className="text-gray-400 text-xs">{label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['overview', 'users', 'activity', 'performance'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">All Users</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Email', 'Tier', 'Trial Days', 'Files', 'Messages', 'Last Active', 'Signed Up'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-gray-400 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const lim = limitsMap[user.id]
                  const lastMsg = userMessages(user.id)[0]
                  return (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUser(selectedUser === user.id ? null : user.id)}
                      className="border-b border-gray-800/50 hover:bg-gray-900/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="text-white font-medium">{user.email}</div>
                        {user.stripe_customer_id && (
                          <div className="text-gray-500 text-xs">{user.stripe_customer_id.slice(0,14)}…</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierColor(lim?.effective_tier || user.subscription_tier, lim?.is_trial_active || false)}`}>
                          {lim?.is_trial_active ? 'Pro Trial' : (lim?.effective_tier || user.subscription_tier)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {lim?.is_trial_active ? `${lim.trial_days_remaining}d` : '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {lim ? `${lim.files_used}/${lim.files_limit}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {lim?.chat_messages_used ?? '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-xs">
                        {lastMsg ? formatTime(lastMsg.created_at) : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-xs">
                        {formatTime(user.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Expanded user detail */}
          {selectedUser && (() => {
            const user = users.find(u => u.id === selectedUser)!
            const msgs = userMessages(selectedUser)
            const userFileList = userFiles(selectedUser)
            return (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mt-4">
                <h3 className="font-semibold text-white mb-4">{user.email} — Detail</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-gray-400 text-xs mb-3 uppercase tracking-wide">Indexed Files ({userFileList.length})</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {userFileList.length === 0 && <p className="text-gray-500 text-sm">No files indexed</p>}
                      {userFileList.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          {f.processing_status === 'completed'
                            ? <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                            : <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                          <span className="text-gray-300 truncate">{f.name}</span>
                          <span className="text-gray-500 text-xs flex-shrink-0">{f.source}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-3 uppercase tracking-wide">Recent Questions ({msgs.length})</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {msgs.length === 0 && <p className="text-gray-500 text-sm">No questions asked yet</p>}
                      {msgs.slice(0, 10).map((m, i) => (
                        <div key={i} className="text-sm">
                          <div className="text-gray-300 truncate">{m.content.slice(0, 80)}{m.content.length > 80 ? '…' : ''}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-gray-500 text-xs">{formatTime(m.created_at)}</span>
                            {m.provenance && (
                              <span className={`text-xs ${provenanceColor(m.provenance)}`}>
                                {m.provenance.type}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Users tab — same as overview but focused */}
      {activeTab === 'users' && (
        <div className="grid md:grid-cols-2 gap-4">
          {users.map(user => {
            const lim = limitsMap[user.id]
            return (
              <div key={user.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-medium text-white">{user.email}</div>
                    <div className="text-gray-500 text-xs mt-0.5">Joined {formatTime(user.created_at)}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierColor(lim?.effective_tier || 'free', lim?.is_trial_active || false)}`}>
                    {lim?.is_trial_active ? `Trial · ${lim.trial_days_remaining}d left` : (lim?.effective_tier || 'free')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Files', value: `${lim?.files_used || 0}/${lim?.files_limit || 50}` },
                    { label: 'Messages', value: lim?.chat_messages_used || 0 },
                    { label: 'Storage', value: `${parseFloat(lim?.storage_used_mb || '0').toFixed(1)} MB` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <div className="text-white font-medium text-sm">{value}</div>
                      <div className="text-gray-500 text-xs">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Recent Questions (all users)</h2>
          <div className="space-y-2">
            {recentMessages.length === 0 && (
              <p className="text-gray-500">No messages yet.</p>
            )}
            {recentMessages.map((m, i) => {
              const user = users.find(u => u.id === m.owner_id)
              return (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-300 text-sm">{m.content}</div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-gray-500 text-xs">{user?.email || 'unknown'}</span>
                        <span className="text-gray-600 text-xs">·</span>
                        <span className="text-gray-500 text-xs">{formatTime(m.created_at)}</span>
                        {m.provenance && (
                          <>
                            <span className="text-gray-600 text-xs">·</span>
                            <span className={`text-xs font-medium ${provenanceColor(m.provenance)}`}>
                              {m.provenance.type}
                              {m.provenance.citationsFound > 0 && ` · ${m.provenance.citationsFound} citations`}
                            </span>
                          </>
                        )}
                        {m.intent_mode && m.intent_mode !== 'qa' && (
                          <span className="text-xs text-purple-400">{m.intent_mode}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Performance tab */}
      {activeTab === 'performance' && (() => {
        // Compute per-user performance stats from assistant messages (carry latency_ms, cost_usd, tokens_out)
        const userStats = users.map(user => {
          const msgs = assistantMessages.filter(m => m.owner_id === user.id)
          const withLatency = msgs.filter(m => m.latency_ms != null)
          const withCost = msgs.filter(m => m.cost_usd != null)
          const avgLatency = withLatency.length > 0
            ? Math.round(withLatency.reduce((s, m) => s + (m.latency_ms || 0), 0) / withLatency.length)
            : null
          const p95Latency = withLatency.length > 0
            ? Math.round([...withLatency].sort((a, b) => (b.latency_ms || 0) - (a.latency_ms || 0))[Math.floor(withLatency.length * 0.05)]?.latency_ms || 0)
            : null
          const totalCost = withCost.reduce((s, m) => s + (m.cost_usd || 0), 0)
          const avgTokensOut = msgs.filter(m => m.tokens_out != null).length > 0
            ? Math.round(msgs.filter(m => m.tokens_out != null).reduce((s, m) => s + (m.tokens_out || 0), 0) / msgs.filter(m => m.tokens_out != null).length)
            : null
          const groundedCount = msgs.filter(m => m.provenance?.type === 'grounded').length
          const generalCount = msgs.filter(m => m.provenance?.type === 'general').length
          const ungroundedCount = msgs.filter(m => m.provenance?.type === 'ungrounded').length
          const groundedRate = msgs.length > 0 ? Math.round((groundedCount / msgs.length) * 100) : null
          return { user, msgs, avgLatency, p95Latency, totalCost, avgTokensOut, groundedRate, groundedCount, generalCount, ungroundedCount }
        }).filter(s => s.msgs.length > 0)

        const totalCostAll = userStats.reduce((s, u) => s + u.totalCost, 0)
        const avgLatencyAll = userStats.filter(u => u.avgLatency != null).length > 0
          ? Math.round(userStats.filter(u => u.avgLatency != null).reduce((s, u) => s + (u.avgLatency || 0), 0) / userStats.filter(u => u.avgLatency != null).length)
          : null

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">Total Cost (session)</div>
                <div className="text-2xl font-bold text-white">${totalCostAll.toFixed(4)}</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">Avg Latency (p50)</div>
                <div className="text-2xl font-bold text-white">{avgLatencyAll != null ? `${avgLatencyAll}ms` : '—'}</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">Active Users</div>
                <div className="text-2xl font-bold text-white">{userStats.length}</div>
              </div>
            </div>

            <h2 className="text-lg font-semibold text-white">Per-User Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['User', 'Queries', 'Avg Latency', 'p95 Latency', 'Avg Tokens Out', 'Grounded %', 'Total Cost'].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-gray-400 font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userStats.map(({ user, msgs, avgLatency, p95Latency, totalCost, avgTokensOut, groundedRate, groundedCount, generalCount, ungroundedCount }) => (
                    <tr key={user.id} className="border-b border-gray-800/50">
                      <td className="py-3 px-4 text-white">{user.email}</td>
                      <td className="py-3 px-4 text-gray-300">{msgs.length}</td>
                      <td className="py-3 px-4 text-gray-300">{avgLatency != null ? `${avgLatency}ms` : '—'}</td>
                      <td className="py-3 px-4 text-gray-300">{p95Latency != null ? `${p95Latency}ms` : '—'}</td>
                      <td className="py-3 px-4 text-gray-300">{avgTokensOut != null ? avgTokensOut : '—'}</td>
                      <td className="py-3 px-4">
                        {groundedRate != null ? (
                          <span className={`text-xs font-medium ${
                            groundedRate >= 70 ? 'text-green-400' : groundedRate >= 40 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {groundedRate}% ({groundedCount}G / {generalCount}GK / {ungroundedCount}U)
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-300">${totalCost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      <div className="mt-12 pt-6 border-t border-gray-800 text-center">
        <p className="text-gray-600 text-xs">Briefly Admin · Read-only · {new Date().toLocaleString()}</p>
      </div>
    </div>
  )
}
