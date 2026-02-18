import { useState, useEffect, useCallback } from 'react'
import { WifiOff, Wifi, RefreshCw, AlertTriangle } from 'lucide-react'
import { syncQueue } from '../lib/syncQueue'
import { onSyncUpdate } from '../lib/syncQueue'
import { photoQueue } from '../lib/photoQueue'

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showReconnected, setShowReconnected] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [stuckCount, setStuckCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const refreshPending = useCallback(async () => {
    const count = await syncQueue.getPendingCount()
    const stuck = await syncQueue.getStuckCount()
    setPendingCount(count)
    setStuckCount(stuck)
    setSyncing(syncQueue.isProcessing())
  }, [])

  useEffect(() => {
    // Subscribe to sync queue updates
    onSyncUpdate(refreshPending)
    refreshPending()
    return () => onSyncUpdate(null)
  }, [refreshPending])

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true)
      if (wasOffline) {
        setShowReconnected(true)
        // Auto-sync queued changes + photos
        await syncQueue.processQueue()
        await photoQueue.processQueue()
        await refreshPending()
        setTimeout(() => setShowReconnected(false), 3000)
      }
    }
    const handleOffline = () => {
      setIsOnline(false)
      setWasOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [wasOffline, refreshPending])

  // Show nothing if online with no pending items and not reconnecting
  if (isOnline && !showReconnected && pendingCount === 0 && !syncing && stuckCount === 0) return null

  // Determine banner state
  let bgColor = '#b8860b' // amber = offline
  let content = null

  if (stuckCount > 0 && isOnline && !syncing) {
    bgColor = '#dc2626' // red = stuck/failed
    content = (
      <>
        <AlertTriangle size={16} />
        {stuckCount} change{stuckCount !== 1 ? 's' : ''} failed to sync — data is saved locally, contact support if this persists
      </>
    )
  } else if (syncing) {
    bgColor = '#3b82f6' // blue = syncing
    content = (
      <>
        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
        Syncing {pendingCount} change{pendingCount !== 1 ? 's' : ''}...
      </>
    )
  } else if (showReconnected) {
    bgColor = '#4a7c59' // green = reconnected
    content = (
      <>
        <Wifi size={16} />
        Back online{pendingCount > 0 ? ` — ${pendingCount} pending` : ' — all synced'}
      </>
    )
  } else if (!isOnline) {
    content = (
      <>
        <WifiOff size={16} />
        Offline{pendingCount > 0 ? ` — ${pendingCount} change${pendingCount !== 1 ? 's' : ''} queued` : ' — changes will sync when connected'}
      </>
    )
  } else if (pendingCount > 0) {
    bgColor = '#d97706' // orange = online but pending
    content = (
      <>
        <RefreshCw size={16} />
        {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync
      </>
    )
  }

  if (!content) return null

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontSize: '13px',
        fontWeight: '600',
        color: '#fff',
        backgroundColor: bgColor,
        transition: 'background-color 0.3s ease',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        {content}
      </div>
    </>
  )
}
