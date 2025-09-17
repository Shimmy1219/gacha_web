// src/services/indexService.js
import { AppStateService } from './appstateService.js';
import { RarityService } from './rarityService.js';
import { ImagesService } from './imagesService.js';
import { RiaguService } from './riaguService.js';

export function createServices(keys = {}) {
  const app    = new AppStateService(keys.app || 'gacha_app_state_v1');
  const rarity = new RarityService(keys.rarity || (window.LS_KEY_RARITY || 'gacha_rarity_config_v1'));
  const images = new ImagesService({
    mapKey:  keys.imgMap  || (window.LS_KEY_IMG  || 'gacha_item_image_map_v1'),
    origKey: keys.origMap || (window.LS_KEY_ORIG || 'gacha_item_original_v1'),
    skipKey: keys.skipSet || (window.LS_KEY_SKIP || 'gacha_item_image_skip_v1'),
  });
  const riagu  = new RiaguService(keys.riagu || (window.LS_KEY_RIAGU_META || 'gacha_riagu_meta_v1'));

  // 初期ロード
  app.load(); rarity.load(); images.load(); riagu.load();

  return { app, rarity, images, riagu };
}
