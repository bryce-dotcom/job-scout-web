// Simple toast notification store
import { friendlyWriteError } from './writeGate'

let listeners = []
let toasts = []
let toastId = 0

export const toastStore = {
  subscribe(listener) {
    listeners.push(listener)
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  },
  getToasts() {
    return toasts
  },
  addToast(toast) {
    const id = ++toastId
    const newToast = { ...toast, id }
    toasts = [...toasts, newToast]
    listeners.forEach(l => l(toasts))

    // Auto dismiss
    setTimeout(() => {
      this.removeToast(id)
    }, toast.duration || 3000)

    return id
  },
  removeToast(id) {
    toasts = toasts.filter(t => t.id !== id)
    listeners.forEach(l => l(toasts))
  }
}

export const toast = {
  success(message, options = {}) {
    return toastStore.addToast({ type: 'success', message, ...options })
  },
  error(message, options = {}) {
    // Hundreds of call sites do toast.error('Failed to save: ' + err.message).
    // When the account is read-only after a trial ends, that leaks the RLS
    // policy name and never mentions billing — so translate here, once, rather
    // than editing every one of them. Ordinary errors pass through untouched.
    const friendly = friendlyWriteError(message)
    return toastStore.addToast({ type: 'error', message: friendly || message, duration: 5000, ...options })
  },
  info(message, options = {}) {
    return toastStore.addToast({ type: 'info', message, ...options })
  },
  warning(message, options = {}) {
    return toastStore.addToast({ type: 'warning', message, ...options })
  },
  announcement(title, message, options = {}) {
    return toastStore.addToast({ type: 'announcement', title, message, duration: 8000, ...options })
  }
}
