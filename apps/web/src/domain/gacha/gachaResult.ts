export interface GachaResultItem {
  itemId: string;
  rarityId: string;
  count: number;
}

export interface GachaResultPayload {
  gachaId: string;
  userId?: string;
  executedAt?: string;
  pullCount: number;
  currencyUsed?: number;
  items: GachaResultItem[];
}
