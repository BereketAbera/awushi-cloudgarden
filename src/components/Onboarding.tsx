import { useState } from 'react'
import { ArrowLeft, ArrowRight, CircleHelp, Compass, Footprints, MapPin, Play, Sparkles, X } from 'lucide-react'
import './onboarding.css'

const steps = [
  { title: 'Meet Awushi.', text: 'A curious little companion in a world of connected technology. Every adventure is safe to try, and every mistake can teach you something.', Icon: Sparkles },
  { title: 'Move at your own pace.', text: 'Use W/S to move and A/D to turn. Drag the world to look around; press C to change camera. On touch screens, use the arrow controls.', Icon: Footprints },
  { title: 'Look a little closer.', text: 'Approach a station and press E to inspect it. Guide Me points to your objective and frames the station. You can also use mission tools from anywhere.', Icon: MapPin },
  { title: 'Start with a small mission.', text: 'Choose Start Adventure for a clear objective and evidence to investigate. Continue Adventure brings back your latest unfinished journey.', Icon: Compass },
  { title: 'Watch the world work.', text: 'Watch Flow follows each infrastructure stage. Pause, replay a stage, or take the camera whenever you want. Approval and repair decisions remain yours.', Icon: Play },
  { title: 'Help is always nearby.', text: 'Use Guide Me for direction or request one hint at a time. The ? button reopens help and this introduction. Change guidance in Settings without losing progress.', Icon: CircleHelp },
] as const
export type OnboardingProps = { open: boolean; onClose: () => void; onStartAdventure: () => void; onExplore: () => void; onWatchFlow?: () => void; onHelp: () => void }

/** A dismissible companion card: no focus trap, no required tour, no blocked world. */
export function GuidedWelcome(props: OnboardingProps) { return props.open ? <WelcomeSteps {...props} /> : null }
function WelcomeSteps({ onClose, onStartAdventure, onExplore, onWatchFlow, onHelp }: OnboardingProps) {
  const [index, setIndex] = useState(0)
  const step = steps[index], Icon = step.Icon
  const act = (callback: () => void) => { onClose(); callback() }
  return <aside className="onboarding-card" aria-label="A quick introduction" data-testid="onboarding" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <div className="onboarding-top"><span><Icon size={17} />A QUICK INTRODUCTION · {index + 1}/{steps.length}</span><button className="icon-button" onClick={onClose} aria-label="Skip introduction" data-testid="onboarding-skip"><X size={16} /></button></div>
    <div className="onboarding-copy" aria-live="polite" aria-atomic="true"><h2>{step.title}</h2><p>{step.text}</p></div>
    <div className="onboarding-step-actions">{index === 1 && <button className="text-button" onClick={() => act(onExplore)}>Try Free Explore<ArrowRight size={13} /></button>}{index === 3 && <button className="text-button" onClick={() => act(onStartAdventure)}>Choose an adventure<ArrowRight size={13} /></button>}{index === 4 && onWatchFlow && <button className="text-button" onClick={() => act(onWatchFlow)}>Try Watch Flow<ArrowRight size={13} /></button>}{index === 5 && <button className="text-button" onClick={() => act(onHelp)}>Open controls & help<ArrowRight size={13} /></button>}</div>
    <footer><div className="onboarding-dots" aria-hidden="true">{steps.map((item, i) => <i key={item.title} className={i === index ? 'current' : ''} />)}</div>{index > 0 && <button className="text-button" onClick={() => setIndex(value => value - 1)} aria-label="Previous introduction step"><ArrowLeft size={13} />Back</button>}<button className="secondary-button" data-testid="onboarding-next" onClick={() => index === steps.length - 1 ? onClose() : setIndex(value => value + 1)}>{index === steps.length - 1 ? 'Ready to explore' : 'Next'}<ArrowRight size={14} /></button></footer>
  </aside>
}
