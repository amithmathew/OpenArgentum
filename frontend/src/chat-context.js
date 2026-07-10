import { createContext, useContext } from 'react'

// Lets any routed page open the Aurelia chat panel with a prompt that auto-sends.
export const ChatContext = createContext(null)

export function useChat() {
  return useContext(ChatContext)
}
