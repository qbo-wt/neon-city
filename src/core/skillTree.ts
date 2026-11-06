import { SKILL_NODES } from '../data/skillNodes';

export function canBuy(nodeId: string, owned: readonly string[], credits: number): boolean {
  const node = SKILL_NODES.find(n => n.id === nodeId);
  if (!node || owned.includes(nodeId)) return false;
  if (node.requires && !owned.includes(node.requires)) return false;
  return credits >= node.cost;
}

export function buyNode(nodeId: string, owned: readonly string[], credits: number): { owned: string[]; credits: number } {
  if (!canBuy(nodeId, owned, credits)) throw new Error(`Cannot buy skill node "${nodeId}"`);
  const node = SKILL_NODES.find(n => n.id === nodeId)!;
  return { owned: [...owned, nodeId], credits: credits - node.cost };
}
