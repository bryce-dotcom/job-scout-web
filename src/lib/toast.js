// Simple toast notification store
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
    return toastStore.addToast({ type: 'error', message, duration: 5000, ...options })
  },
  info(message, options = {}) {
    return toastStore.addToast({ type: 'info', message, ...options })
  },
  warning(message, options = {}) {
    return toastStore.addToast({ type: 'warning', message, ...options })
  }
}
