// Compact-mode stage legend. On desktop the pipeline's own stage strip does
// this job; on a phone the chips live inside the map instead.

export default function StageChips({ t, stages, hiddenStages, geocodedLeads, onToggleStage }) {
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 8px', borderBottom: `1px solid ${t.border}`, backgroundColor: t.bgCard, WebkitOverflowScrolling: 'touch', flexShrink: 0 }}>
      {stages.map(s => {
        const off = hiddenStages?.has(s.id)
        const n = geocodedLeads.filter(l => l.status === s.id).length
        return (
          <button key={s.id} onClick={() => onToggleStage(s.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, height: 30, padding: '0 10px', borderRadius: 15,
            border: `1px solid ${off ? t.border : s.color}`, backgroundColor: off ? 'transparent' : s.color + '1a',
            color: off ? t.textMuted : s.color, fontSize: 12, fontWeight: 600, opacity: off ? 0.6 : 1, cursor: 'pointer'
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.color }} />{s.name}{n > 0 && <span style={{ fontWeight: 400 }}>{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
