import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const root = resolve(import.meta.dirname, '..');
const voicePanel = readFileSync(resolve(root, 'src/voice/VoicePanel.tsx'), 'utf8');
const styles = readFileSync(resolve(root, 'src/voice-onboarding.css'), 'utf8');

assert(voicePanel.includes('join-overlay'), 'join modal must render before Presence connection');
assert(voicePanel.includes('aria-modal="true"'), 'join modal must be modal for accessibility');
assert(voicePanel.includes("useState<AvatarModel>('male')"), 'avatar model selection state exists');
assert(voicePanel.includes("['male', 'female'] as const"), 'male and female options are rendered');
assert(voicePanel.includes('setLocalAvatarModel(model)'), 'selected avatar model reaches game state');
assert(voicePanel.includes('voice-compact'), 'connected state uses compact voice controls');
assert(!voicePanel.includes('manualRoomName'), 'manual room developer field is removed');
assert(!voicePanel.includes('voice-panel__status'), 'large developer status panel is removed');
assert(styles.includes('.join-overlay'), 'join modal styles exist');
assert(styles.includes('.voice-compact'), 'compact voice styles exist');

console.log('check-onboarding-ui: ok');
