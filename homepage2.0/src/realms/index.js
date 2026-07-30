import { AbyssRealm } from './AbyssRealm.js';
import { FoundryRealm } from './FoundryRealm.js';
import { VelocityRealm } from './VelocityRealm.js';
import { LatticeRealm } from './LatticeRealm.js';
import { AtelierRealm } from './AtelierRealm.js';
import { OrbitRealm } from './OrbitRealm.js';

/**
 * The realm registry. Keys must match `id` in content/realms.js.
 *
 * A realm listed in content but missing here is simply skipped: it won't appear
 * in navigation and its sections fall back to their next declared realm. That's
 * what lets a new theme be designed on paper before it's built.
 */
export const REALM_CLASSES = {
  abyss: AbyssRealm,
  foundry: FoundryRealm,
  velocity: VelocityRealm,
  lattice: LatticeRealm,
  atelier: AtelierRealm,
  orbit: OrbitRealm,
};
