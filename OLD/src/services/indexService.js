// src/services/indexService.js
import { AppStateService } from './appstateService.js';
import { RarityService } from './rarityService.js';
import { ImagesService } from './imagesService.js';
import { RiaguService } from './riaguService.js';

export function createServices(keys = {}) {
  const app    = new AppStateService(keys.app);
  const rarity = new RarityService(keys.rarity);
  const images = new ImagesService({
    mapKey:  keys.imgMap,
    origKey: keys.origMap,
    skipKey: keys.skipSet,
  });
  const riagu  = new RiaguService(keys.riagu);

  // 初期ロード
  app.load(); rarity.load(); images.load(); riagu.load();

  return { app, rarity, images, riagu };
}
