export type SourceLanguage = 'ko-KR' | 'en-US' | 'auto';

export interface CaptionItem {
  id: string;
  timestamp: number;
  sourceLang: 'ko' | 'en' | 'auto';
  sourceText: string;
  translatedText: string;
  isFinal: boolean;
  speakerName?: string;
  pinned?: boolean;
}

export type TextStrokeSize = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type BackgroundStyle = 
  | 'transparent' 
  | 'chroma-green' 
  | 'chroma-blue' 
  | 'chroma-magenta' 
  | 'black-box' 
  | 'frosted-glass';

export type DisplayMode = 
  | 'bilingual'          // Speaker's original Korean/English on top, Vietnamese below
  | 'vietnamese-only'   // Clean single-language Vietnamese translation
  | 'rolling-ledger';   // Multi-line teleprompter / LED stage wall history

export type VerticalPosition = 'bottom' | 'center' | 'top';
export type TextAlignment = 'center' | 'left' | 'right';

export type STTEngine = 'webspeech' | 'openrouter' | 'local-gpu';
export type HardwareDevice = 'auto' | 'cuda' | 'intel-arc' | 'cpu';

export type TranslationEngine = 'google-free' | 'openrouter' | 'openai' | 'deepl' | 'google-cloud';

export interface GlossaryEntry {
  from: string;
  to: string;
}

export interface CaptionConfig {
  // Typography
  fontSize: number;          // 20 - 120 px
  fontFamily: string;        // 'Outfit' | 'Inter' | 'Montserrat' | 'Arial'
  fontWeight: '400' | '600' | '700' | '800';
  vietnameseColor: string;   // e.g. #FFFFFF or #F6C445
  originalColor: string;     // e.g. #A1A1AA or #E4E4E7
  textStroke: TextStrokeSize;
  textShadow: boolean;
  letterSpacing: string;

  // Background & Box
  bgStyle: BackgroundStyle;
  bgOpacity: number;         // 0 - 100%
  boxPaddingX: number;       // px
  boxPaddingY: number;       // px
  borderRadius: number;      // px
  maxWidthPercent: number;   // 60% - 100%

  // Layout & Presentation
  displayMode: DisplayMode;
  position: VerticalPosition;
  alignment: TextAlignment;
  maxLines: number;          // 1, 2, 3, or more
  autoClearSec: number;      // 0 = never, 3, 5, 8, 12, 15
  showSpeakerBadge: boolean;
  speakerLabel: string;      // e.g. "Speaker (KR)" or "Speaker (EN)"

  // Speech-to-Text (STT) Engine & Hardware
  sttEngine: STTEngine;
  openrouterApiKey?: string;
  openrouterModel?: string;       // e.g. 'openai/gpt-transcribe'
  openrouterBaseUrl?: string;     // e.g. 'https://openrouter.ai/api/v1'
  localGpuUrl?: string;           // e.g. 'http://127.0.0.1:8000'
  localGpuModel?: string;         // 'tiny' | 'base' | 'small'
  hardwareDevice?: HardwareDevice;// 'auto' | 'cuda' | 'intel-arc' | 'cpu'
  sttChunkIntervalSec?: number;   // 2 to 4 seconds

  // Audio & Hardware Settings
  sourceLanguage: SourceLanguage;
  micDeviceId: string;
  audioGain: number;         // 1.0 - 4.0
  enablePunctuation: boolean;
  customGlossary: GlossaryEntry[];
  
  // Translation Engine & API Keys
  translationEngine: TranslationEngine;
  openrouterTranslateModel?: string; // e.g. 'google/gemini-2.5-flash' or 'openai/gpt-4o-mini'
  openaiApiKey?: string;
  openaiModel?: string;
  deeplApiKey?: string;
  googleCloudApiKey?: string;

  // Custom Announcement
  pinnedAnnouncement: string | null;
}

export const DEFAULT_CAPTION_CONFIG: CaptionConfig = {
  fontSize: 42,
  fontFamily: 'Outfit, sans-serif',
  fontWeight: '700',
  vietnameseColor: '#FFFFFF',
  originalColor: '#CBD5E1',
  textStroke: 'md',
  textShadow: true,
  letterSpacing: '0px',

  bgStyle: 'transparent',
  bgOpacity: 75,
  boxPaddingX: 32,
  boxPaddingY: 16,
  borderRadius: 16,
  maxWidthPercent: 92,

  displayMode: 'bilingual',
  position: 'bottom',
  alignment: 'center',
  maxLines: 2,
  autoClearSec: 7,
  showSpeakerBadge: true,
  speakerLabel: 'Diễn giả',

  sourceLanguage: 'ko-KR',
  micDeviceId: 'default',
  audioGain: 1.5,
  enablePunctuation: true,
  sttEngine: 'webspeech',
  openrouterApiKey: '',
  openrouterModel: 'openai/gpt-transcribe',
  openrouterBaseUrl: 'https://openrouter.ai/api/v1',
  openrouterTranslateModel: 'google/gemini-2.5-flash',
  localGpuUrl: 'http://127.0.0.1:8000',
  localGpuModel: 'base',
  hardwareDevice: 'auto',
  sttChunkIntervalSec: 3,
  customGlossary: [
    { from: 'AI', to: 'Trí tuệ nhân tạo' },
    { from: 'VBE', to: 'VBE Event Group' },
    { from: 'HCMC', to: 'TP. Hồ Chí Minh' },
    { from: 'Seoul', to: 'Seoul' },
    { from: 'CEO', to: 'Tổng giám đốc' },
    { from: 'K-Pop', to: 'K-Pop' }
  ],

  translationEngine: 'google-free',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  deeplApiKey: '',
  googleCloudApiKey: '',

  pinnedAnnouncement: null
};

export interface SessionInfo {
  id: string;
  name: string;
  createdAt: number;
  lastActiveAt: number;
  hasCaption?: boolean;
}

export type BroadcastPayload = 
  | { type: 'CAPTION_UPDATE'; caption: CaptionItem; session?: string }
  | { type: 'CONFIG_UPDATE'; config: CaptionConfig; session?: string }
  | { type: 'CLEAR_SCREEN'; session?: string }
  | { type: 'PIN_ANNOUNCEMENT'; text: string | null; session?: string }
  | { type: 'HEARTBEAT'; timestamp: number; session?: string };
