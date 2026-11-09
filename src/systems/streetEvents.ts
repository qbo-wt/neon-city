import { CONTRACTS, contractText, type Contract } from '../core/contract';
import type { OfferOpts } from '../core/implantOffer';
import { pick, type Rng } from '../core/rng';
import type { Relic } from '../core/types';
import type { ChoiceOption } from '../ui/ChoicePanel';

export type StreetEventId = 'fixer' | 'streetdoc' | 'netrunner' | 'merchant';
export const STREET_EVENT_IDS: StreetEventId[] = ['fixer', 'streetdoc', 'netrunner', 'merchant'];

/** Who you meet in a non-combat sector. Looks are NPC sheets from gfx/npcArt. */
export const STREET_EVENTS: Record<StreetEventId, { name: string; look: string; color: number; banner: string; lines: string[] }> = {
  fixer: {
    name: 'Rook, fixer', look: 'ev-fixer', color: 0xf5e663, banner: 'UN FIXER T\'ATTEND',
    lines: ['J\'ai du boulot pour toi. Bien payé, si tu tiens la cadence.', 'Les Rats paient mal. Moi, je paie bien. Choisis ton contrat.', 'Un contrat, une prime. Pas de questions, pas de remboursement.'],
  },
  streetdoc: {
    name: 'Doc Pavé, charcudoc de rue', look: 'ev-doc', color: 0xff3b3b, banner: 'UNE CLINIQUE SAUVAGE',
    lines: ['Table pliante, scalpel stérilisé à la vodka. Tu t\'allonges ?', 'J\'ai des pièces fraîches. Certaines sont même légales.', 'Tes neurones grésillent. Je peux purger ça. Contre un peu de toi.'],
  },
  netrunner: {
    name: 'Zéro, netrunner', look: 'ev-net', color: 0x39ff88, banner: 'UN NETRUNNER JOUE',
    lines: ['On joue ? Le réseau est truqué, mais pas toujours contre toi.', 'Je peux te recâbler la tête. Ou te la griller. On parie ?', 'Un distributeur à pirater, cinquante bugs à éviter. Ça te tente ?'],
  },
  merchant: {
    name: 'Mama Kit, marchande ambulante', look: 'ev-merchant', color: 0x00f0ff, banner: 'UNE MARCHANDE AMBULANTE',
    lines: ['Stimpacks, bloqueurs, et ce que tu ne trouveras nulle part ailleurs.', 'Prix d\'ami. Mais je n\'ai pas d\'amis.', 'Tout se vend, chéri. Même ce qui est sous le comptoir.'],
  },
};

/** What an event can do to the run; implemented by the RunScene. */
export interface EventCtx {
  rng: Rng;
  credits(): number;
  spend(n: number): void;
  gain(n: number): void;
  hp(): number;
  hurt(n: number): void;
  healFraction(f: number): void;
  addPsy(n: number): void;
  addBlocker(): void;
  /** Opens an implant choice; 'black' = black-market cards only. */
  implants(opts: OfferOpts | 'black'): void;
  relicLeft(): Relic | undefined;
  giveRelic(r: Relic): void;
  /** Raises a random carried implant by one level; its name, or undefined if none can be. */
  upgradeRandom(): string | undefined;
  canUpgrade(): boolean;
  sign(c: Contract): void;
  say(msg: string, color?: string): void;
}

const CONTRACT_LABELS: Record<Contract['kind'], string> = { nohit: 'Contrat sans bavure', speed: 'Contrat express', parry: 'Contrat du duelliste' };

export function eventOptions(id: StreetEventId, c: EventCtx): ChoiceOption[] {
  const money = (n: number) => c.credits() >= n;
  switch (id) {
    case 'fixer':
      return CONTRACTS.map(k => ({
        label: CONTRACT_LABELS[k.kind], desc: contractText(k),
        pick: () => { c.sign(k); c.say('CONTRAT SIGNÉ', '#f5e663'); },
      }));
    case 'streetdoc':
      return [
        { label: 'Greffe propre', desc: 'Un implant rare ou mieux, posé proprement.', cost: '25¢', enabled: money(25), pick: () => { c.spend(25); c.implants({ minRarity: 'rare' }); } },
        { label: 'Greffe du marché noir', desc: 'Gratuit. Un implant du marché noir : très fort, avec un vrai défaut.', cost: 'gratuit', pick: () => c.implants('black') },
        { label: 'Purge neurale', desc: 'Retire 35 de psychose. Il prélève un peu de sang au passage.', cost: '-15 PV', enabled: c.hp() > 15, pick: () => { c.hurt(15); c.addPsy(-35); c.say('-35 PSY', '#39ff88'); } },
      ];
    case 'netrunner':
      return [
        { label: 'Quitte ou double', desc: 'Une chance sur deux : -40 de psychose... ou +25.', cost: 'pari', pick: () => {
          if (c.rng() < 0.5) { c.addPsy(-40); c.say('GAGNÉ — -40 PSY', '#39ff88'); } else { c.addPsy(25); c.say('PERDU — +25 PSY', '#ff2a6d'); }
        } },
        { label: 'Pirater un distributeur', desc: '65 % : +25¢. Sinon la contre-mesure te grille : -15 PV.', cost: 'pari', enabled: c.hp() > 15, pick: () => {
          if (c.rng() < 0.65) { c.gain(25); c.say('+25¢', '#f5e663'); } else { c.hurt(15); c.say('CONTRE-MESURE — -15 PV', '#ff2a6d'); }
        } },
        { label: 'Neuro-bloqueur pirate', desc: '+1 neuro-bloqueur.', cost: '12¢', enabled: money(12), pick: () => { c.spend(12); c.addBlocker(); c.say('+1 NEURO-BLOQUEUR', '#39ff88'); } },
      ];
    case 'merchant': {
      const relic = c.relicLeft();
      const opts: ChoiceOption[] = [
        { label: 'Stimpack', desc: 'Soigne 40 % de ta vie.', cost: '15¢', enabled: money(15), pick: () => { c.spend(15); c.healFraction(0.4); } },
        { label: 'Neuro-bloqueur', desc: '+1 neuro-bloqueur.', cost: '12¢', enabled: money(12), pick: () => { c.spend(12); c.addBlocker(); c.say('+1 NEURO-BLOQUEUR', '#39ff88'); } },
        { label: 'Révision d\'implant', desc: 'Améliore d\'un niveau un implant que tu portes, au hasard.', cost: '30¢', enabled: money(30) && c.canUpgrade(), pick: () => {
          c.spend(30); const n = c.upgradeRandom(); if (n) c.say(`${n.toUpperCase()} AMÉLIORÉ`, '#f5e663');
        } },
      ];
      if (relic) opts.push({ label: 'Sous le comptoir', desc: `${relic.name} : ${relic.description}`, cost: '70¢', enabled: money(70), pick: () => { c.spend(70); c.giveRelic(relic); } });
      return opts;
    }
  }
}

export const eventLine = (id: StreetEventId, rng: Rng) => pick(rng, STREET_EVENTS[id].lines);
