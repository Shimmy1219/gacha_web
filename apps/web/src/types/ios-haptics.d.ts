declare module 'https://esm.sh/ios-haptics' {
  interface HapticTrigger {
    (): void;
    confirm?: () => void;
    error?: () => void;
  }

  export const haptic: HapticTrigger;
  export const supportsHaptics: boolean;
}

export interface HapticsModule {
  haptic: {
    (): void;
    confirm?: () => void;
    error?: () => void;
  };
  supportsHaptics: boolean;
}
