export type SourceLanguage = 'ko-KR' | 'en-US' | 'auto';

export interface SpeakerProfile {
  id: string;
  name: string;
  role?: string;
  color: string;
  defaultLang?: SourceLanguage;
  micDeviceId?: string;
}

export interface ConnectedDevice {
  deviceId: string;
  deviceName: string;
  role: 'operator' | 'mic-node' | 'led' | 'vmix' | 'viewer';
  speakerName?: string;
  lastSeen: number;
}

export interface CaptionItem {
  id: string;
  timestamp: number;
  sourceLang: 'ko' | 'en' | 'auto';
  sourceText: string;
  translatedText: string;
  isFinal: boolean;
  speakerId?: string;
  speakerName?: string;
  speakerRole?: string;
  speakerColor?: string;
  deviceId?: string;
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

export type TranslationEngine = 'auto' | 'google-free' | 'openrouter' | 'openai' | 'deepl' | 'google-cloud';

export interface GlossaryEntry {
  from: string;
  to: string;
}

export interface CaptionConfig {
  // Typography
  fontSize: number;          // 20 - 120 px
  fontFamily: string;        // 'Roboto' | 'Outfit' | 'Inter' | 'Montserrat' | 'Arial'
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
  speakerLabel: string;      // Active speaker display name
  activeSpeakerId?: string;  // Active speaker profile ID
  speakers?: SpeakerProfile[]; // Multi-speaker roster for this room

  // LED Wall Calibration
  ledSafeMarginPx?: number;  // Safe margin for physical LED walls (0 - 120px)

  // Speech-to-Text (STT) Engine & Hardware
  sttEngine: STTEngine;
  openrouterApiKey?: string;
  openrouterModel?: string;       // e.g. 'openai/gpt-transcribe'
  openrouterBaseUrl?: string;     // e.g. 'https://openrouter.ai/api/v1'
  localGpuUrl?: string;           // e.g. 'http://127.0.0.1:8000'
  localGpuModel?: string;         // 'tiny' | 'base' | 'small'
  hardwareDevice?: HardwareDevice;// 'auto' | 'cuda' | 'intel-arc' | 'cpu'
  sttChunkIntervalSec?: number;   // max seconds per chunk; chunks also end early on a speech pause

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

export const DEFAULT_SPEAKERS: SpeakerProfile[] = [
  {
    id: 'spk-1',
    name: 'Diễn giả chính',
    role: 'Keynote',
    color: '#F59E0B',
    defaultLang: 'ko-KR',
  },
  {
    id: 'spk-2',
    name: 'Diễn giả khách mời',
    role: 'Panelist',
    color: '#10B981',
    defaultLang: 'en-US',
  },
  {
    id: 'spk-3',
    name: 'Điều phối viên (MC)',
    role: 'Moderator',
    color: '#38BDF8',
    defaultLang: 'en-US',
  },
  {
    id: 'spk-4',
    name: 'Khách mời Q&A',
    role: 'Audience Q&A',
    color: '#A855F7',
    defaultLang: 'ko-KR',
  },
];

export const DEFAULT_CAPTION_CONFIG: CaptionConfig = {
  fontSize: 42,
  fontFamily: "'Roboto', sans-serif",
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
  maxLines: 3,
  autoClearSec: 7,
  showSpeakerBadge: true,
  speakerLabel: 'Diễn giả chính',
  activeSpeakerId: 'spk-1',
  speakers: DEFAULT_SPEAKERS,
  ledSafeMarginPx: 24,

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
  sttChunkIntervalSec: 8,
  customGlossary: [
    { from: 'AI', to: 'Trí tuệ nhân tạo' },
    { from: 'VBE', to: 'VBE Event Group' },
    { from: 'HCMC', to: 'TP. Hồ Chí Minh' },
    { from: 'Seoul', to: 'Seoul' },
    { from: 'CEO', to: 'Tổng giám đốc' },
    { from: 'K-Pop', to: 'K-Pop' }
  ],

  translationEngine: 'auto',
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
  lastUpdated: number;
  hasCaption?: boolean;
  captionCount?: number;
  deviceCount?: number;
  activeSpeaker?: string;
  latestCaptionText?: string;
}

export type BroadcastPayload = 
  | { type: 'CAPTION_UPDATE'; caption: CaptionItem; session?: string; device?: ConnectedDevice }
  | { type: 'CONFIG_UPDATE'; config: CaptionConfig; session?: string; device?: ConnectedDevice }
  | { type: 'CLEAR_SCREEN'; session?: string; device?: ConnectedDevice }
  | { type: 'PIN_ANNOUNCEMENT'; text: string | null; session?: string; device?: ConnectedDevice }
  | { type: 'HEARTBEAT'; timestamp: number; session?: string; device?: ConnectedDevice };
