export { ThemeProvider, createTheme, themes } from './themes/theme.js'
export type { OmnaiTheme, ThemeProviderProps } from './themes/theme.js'

export { ChatThread } from './components/ChatThread.js'
export { ChatInput } from './components/ChatInput.js'
export { MessageBubble } from './components/MessageBubble.js'
export { ApprovalCard } from './components/ApprovalCard.js'
export { QuestionCard } from './components/QuestionCard.js'
export { StatusBar } from './components/StatusBar.js'
export { UsageBar } from './components/UsageBar.js'
export type { UsageBarProps } from './components/UsageBar.js'
export { ModelSelect } from './components/ModelSelect.js'
export type { ModelSelectProps } from './components/ModelSelect.js'
export { MODEL_OPTIONS, getModelCapabilities } from '@sweech/engine'
export type { ModelOption } from '@sweech/engine'

export { useSweechSession } from './hooks/useSweechSession.js'
export { useSweechWebSession } from './hooks/useSweechWebSession.js'
export { useSweechMessages } from './hooks/useSweechMessages.js'
export { useAgentStream } from './hooks/useAgentStream.js'

export { agentEventToMessages, parseStreamLine, parseOmnaiUIEvent, makeMessage, stripAnsi, filterTextBlock } from './utils/parse.js'

export type {
  Message, MessageType, SessionState, SessionStatus, CostSummary,
  ApprovalRequest, ApprovalStage, ApprovalAction,
  QuestionRequest, QuestionOption,
  SessionArchiveSnapshot, SessionArchiveStore, SessionRetentionPolicy,
  OmnaiUIEvent, OmnaiUICommand,
  // re-exported from sweech engine
  AgentEvent, ModelRunner, AgentRunner, RunOptions, TokenUsage, Provider, EngineId,
} from './types/index.js'

export type { UseOmnaiSessionOptions, UseOmnaiSessionReturn } from './hooks/useSweechSession.js'
export type { UseSweechWebSessionOptions, UseSweechWebSessionReturn } from './hooks/useSweechWebSession.js'
export type { UseSweechMessagesReturn, PushOptions } from './hooks/useSweechMessages.js'
export type { UseAgentStreamOptions, UseAgentStreamReturn } from './hooks/useAgentStream.js'
export type { ChatThreadProps } from './components/ChatThread.js'
export type { ChatInputProps } from './components/ChatInput.js'
export type { MessageBubbleProps } from './components/MessageBubble.js'
export type { ApprovalCardProps } from './components/ApprovalCard.js'
export type { QuestionCardProps } from './components/QuestionCard.js'
export type { StatusBarProps } from './components/StatusBar.js'
