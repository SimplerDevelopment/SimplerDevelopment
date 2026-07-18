import { useEffect, useRef, useState, useCallback } from 'react';

export type MessageType =
  | 'SELECTION_CHANGED'
  | 'BLOCK_UPDATED'
  | 'DOCK_REQUESTED'
  | 'WINDOW_CLOSING'
  | 'BLOCK_DELETED'
  | 'BLOCKS_CHANGED'
  | 'VIEWPORT_CHANGED';

export interface SettingsPanelMessage {
  type: MessageType;
  payload: unknown;
  tabId: string;
  timestamp: number;
}

interface UseSettingsPanelSyncOptions {
  isMainWindow: boolean;
  onMessage: (message: SettingsPanelMessage) => void;
  tabId: string;
}

export function useSettingsPanelSync({
  isMainWindow,
  onMessage,
  tabId,
}: UseSettingsPanelSyncOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Initialize BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const channelName = `block-editor-settings-${tabId}`;

    try {
      const channel = new BroadcastChannel(channelName);
      channelRef.current = channel;
      setIsConnected(true);

      // Handle incoming messages
      channel.onmessage = (event: MessageEvent<SettingsPanelMessage>) => {
        const message = event.data;

        // Validate message structure
        if (
          !message ||
          typeof message !== 'object' ||
          !message.type ||
          !message.tabId
        ) {
          console.warn('Invalid message received:', message);
          return;
        }

        // Only process messages for this tab
        if (message.tabId !== tabId) {
          return;
        }

        // Call the latest callback via ref
        onMessageRef.current(message);
      };
    } catch (error) {
      console.error('Failed to create BroadcastChannel:', error);
      setIsConnected(false);
    }

    // Cleanup
    return () => {
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [tabId]);

  // Send message function
  const sendMessage = useCallback((type: MessageType, payload: unknown) => {
    if (!channelRef.current) {
      console.warn('BroadcastChannel not initialized');
      return;
    }

    const message: SettingsPanelMessage = {
      type,
      payload,
      tabId,
      timestamp: Date.now(),
    };

    try {
      channelRef.current.postMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [tabId]);

  return {
    sendMessage,
    isConnected,
  };
}
