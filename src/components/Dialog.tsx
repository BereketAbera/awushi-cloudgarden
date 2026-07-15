import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Props = { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string; testId?: string }
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]'

/** A shared modal: focus stays inside, Escape closes, and the opener regains focus. */
export function Dialog({ title, eyebrow, children, onClose, wide, className = '', testId }: Props) {
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = panel.current
    // Capture the opener before inert blurs it; restore inert before returning focus.
    const shell = node?.closest('.app')?.querySelector<HTMLElement>('.app-shell')
    if (shell) shell.inert = true
    const first = node?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab' || !node) return
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(item => item.getClientRects().length > 0)
      const firstItem = items[0], lastItem = items[items.length - 1]
      if (!firstItem) { event.preventDefault(); node.focus(); return }
      if (event.shiftKey && (document.activeElement === firstItem || !node.contains(document.activeElement))) { event.preventDefault(); lastItem.focus() }
      else if (!event.shiftKey && (document.activeElement === lastItem || !node.contains(document.activeElement))) { event.preventDefault(); firstItem.focus() }
    }
    document.addEventListener('keydown', keydown, true)
    return () => {
      document.removeEventListener('keydown', keydown, true)
      if (shell) shell.inert = false
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return <div className="dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={panel} className={`dialog ${wide ? 'dialog-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
      <div className="dialog-controls"><button className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog" data-testid="close-dialog"><X size={20} /></button></div>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 id={titleId}>{title}</h2>
      {children}
    </section>
  </div>
}
