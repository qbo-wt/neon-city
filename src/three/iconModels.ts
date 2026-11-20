/**
 * Lazy entry points to the 3D icon renderers (implants, relics, spells). Their modules (about 40 kB of
 * model recipes) load on the first icon asked for, not with the game's main bundle.
 */
export const implantTexture = (...a: Parameters<typeof import('./implantModels').implantTexture>) =>
  import('./implantModels').then(m => m.implantTexture(...a));
export const relicTexture = (...a: Parameters<typeof import('./relicModels').relicTexture>) =>
  import('./relicModels').then(m => m.relicTexture(...a));
export const showSpellPicture = (...a: Parameters<typeof import('./spellModels').showSpellPicture>) =>
  void import('./spellModels').then(m => m.showSpellPicture(...a));
