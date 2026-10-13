// Every enemy model, by key (bestiary.js `model`), across the four factions:
//   scav:*   human raiders and their exo-suits (models/Scavs.js)
//   hive:*   alien insectoids and floating psions (models/Hive.js)
//   synth:*  robots: sentry drones, stalkers, bulwarks, the Colossus (models/Synths.js)
//   fauna:*  alien wildlife on many-legged rigs (models/Fauna.js)
// MODELS[key]() builds a template rig; bindAny(model) re-finds the bones on a clone.
import { SCAV_MODELS } from './Scavs.js';
import { HIVE_MODELS } from './Hive.js';
import { SYNTH_MODELS } from './Synths.js';
import { FAUNA_MODELS } from './Fauna.js';
import { BROOD_MODELS } from './Brood.js';

export { bindAny, legSkeleton, hoverSkeleton } from './Rigs.js';

// (models/Brood.js: what the Brood Mother brings into her raid — her eggs and hearts.)
export const MODELS = { ...SCAV_MODELS, ...HIVE_MODELS, ...SYNTH_MODELS, ...FAUNA_MODELS, ...BROOD_MODELS };
