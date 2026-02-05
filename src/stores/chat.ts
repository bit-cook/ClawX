/**
 * Chat State Store
 * Manages chat messages and conversation state
 */
import { create } from 'zustand';

/**
 * Tool call in a message
 */
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
}

/**
 * Chat message
 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  channel?: string;
  toolCalls?: ToolCall[];
}

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  // Track active run for streaming
  activeRunId: string | null;
  
  // Actions
  fetchHistory: (limit?: number) => Promise<void>;
  sendMessage: (content: string, channelId?: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;
  setMessages: (messages: ChatMessage[]) => void;
  handleChatEvent: (event: Record<string, unknown>) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  loading: false,
  sending: false,
  error: null,
  activeRunId: null,
  
  fetchHistory: async (limit = 50) => {
    set({ loading: true, error: null });
    
    try {
      // OpenClaw chat.history requires: { sessionKey, limit? }
      // Response format: { sessionKey, sessionId, messages, thinkingLevel, verboseLevel }
      const result = await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'chat.history',
        { sessionKey: 'main', limit }
      ) as { success: boolean; result?: { messages?: unknown[] } | unknown; error?: string };
      
      if (result.success && result.result) {
        const data = result.result as Record<string, unknown>;
        const rawMessages = Array.isArray(data.messages) ? data.messages : [];
        
        // Map OpenClaw messages to our ChatMessage format
        const messages: ChatMessage[] = rawMessages.map((msg: unknown, idx: number) => {
          const m = msg as Record<string, unknown>;
          return {
            id: String(m.id || `msg-${idx}`),
            role: (m.role as 'user' | 'assistant' | 'system') || 'assistant',
            content: String(m.content || m.text || ''),
            timestamp: String(m.timestamp || new Date().toISOString()),
          };
        });
        
        set({ messages, loading: false });
      } else {
        // No history yet or method not available - just show empty
        set({ messages: [], loading: false });
      }
    } catch (error) {
      console.warn('Failed to fetch chat history:', error);
      set({ messages: [], loading: false });
    }
  },
  
  sendMessage: async (content, _channelId) => {
    const { addMessage } = get();
    
    // Add user message immediately
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);
    
    set({ sending: true, error: null });
    
    try {
      // OpenClaw chat.send requires: { sessionKey, message, idempotencyKey }
      // Response is an acknowledgment: { runId, status: "started" }
      // The actual AI response comes via WebSocket chat events
      const idempotencyKey = crypto.randomUUID();
      const result = await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'chat.send',
        { sessionKey: 'main', message: content, idempotencyKey }
      ) as { success: boolean; result?: { runId?: string; status?: string }; error?: string };
      
      if (!result.success) {
        set({ error: result.error || 'Failed to send message', sending: false });
      } else {
        // Store the active run ID - response will come via chat events
        const runId = result.result?.runId;
        if (runId) {
          set({ activeRunId: runId });
        }
        // Keep sending=true until we receive the final chat event
      }
    } catch (error) {
      set({ error: String(error), sending: false });
    }
  },
  
  clearHistory: async () => {
    try {
      await window.electron.ipcRenderer.invoke('gateway:rpc', 'chat.clear');
      set({ messages: [] });
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  },
  
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },
  
  updateMessage: (messageId, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      ),
    }));
  },
  
  setMessages: (messages) => set({ messages }),
  
  /**
   * Handle incoming chat event from Gateway WebSocket
   * Events: { runId, sessionKey, seq, state, message, errorMessage }
   * States: "delta" (streaming), "final" (complete), "aborted", "error"
   */
  handleChatEvent: (event) => {
    const { addMessage, updateMessage, messages } = get();
    const runId = String(event.runId || '');
    const state = String(event.state || '');
    
    if (state === 'delta') {
      // Streaming delta - find or create assistant message for this run
      const existingMsg = messages.find((m) => m.id === `run-${runId}`);
      const messageContent = event.message as Record<string, unknown> | undefined;
      const content = String(messageContent?.content || messageContent?.text || '');
      
      if (existingMsg) {
        // Append to existing message
        updateMessage(`run-${runId}`, {
          content: existingMsg.content + content,
        });
      } else if (content) {
        // Create new assistant message
        addMessage({
          id: `run-${runId}`,
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
        });
      }
    } else if (state === 'final') {
      // Final message - replace or add complete response
      const messageContent = event.message as Record<string, unknown> | undefined;
      const content = String(
        messageContent?.content 
        || messageContent?.text 
        || (typeof messageContent === 'string' ? messageContent : '')
      );
      
      const existingMsg = messages.find((m) => m.id === `run-${runId}`);
      if (existingMsg) {
        updateMessage(`run-${runId}`, { content });
      } else if (content) {
        addMessage({
          id: `run-${runId}`,
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
        });
      }
      set({ sending: false, activeRunId: null });
    } else if (state === 'error') {
      const errorMsg = String(event.errorMessage || 'An error occurred');
      set({ error: errorMsg, sending: false, activeRunId: null });
    } else if (state === 'aborted') {
      set({ sending: false, activeRunId: null });
    }
  },
}));
