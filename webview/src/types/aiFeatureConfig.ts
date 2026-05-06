export type AiFeatureProvider = 'claude' | 'codex' | 'openclaude' | 'crewai';
export type AiFeatureResolutionSource = 'manual' | 'auto' | 'unavailable';

export const DEFAULT_AI_FEATURE_MODELS = {
  claude: 'claude-sonnet-4-6',
  codex: 'gpt-5.5',
  openclaude: 'gemini-2.5-flash',
  crewai: 'default',
} as const;

export interface AiFeatureConfig {
  provider: AiFeatureProvider | null;
  effectiveProvider: AiFeatureProvider | null;
  resolutionSource: AiFeatureResolutionSource;
  models: {
    claude: string;
    codex: string;
    openclaude: string;
    crewai: string;
  };
  availability: {
    claude: boolean;
    codex: boolean;
    openclaude: boolean;
    crewai: boolean;
  };
}

export type CommitAiProvider = AiFeatureProvider;
export type CommitAiResolutionSource = AiFeatureResolutionSource;
export type CommitAiConfig = AiFeatureConfig;

export const DEFAULT_COMMIT_AI_CONFIG: CommitAiConfig = {
  provider: null,
  effectiveProvider: 'codex',
  resolutionSource: 'auto',
  models: {
    claude: DEFAULT_AI_FEATURE_MODELS.claude,
    codex: DEFAULT_AI_FEATURE_MODELS.codex,
    openclaude: DEFAULT_AI_FEATURE_MODELS.openclaude,
    crewai: DEFAULT_AI_FEATURE_MODELS.crewai,
  },
  availability: {
    claude: false,
    codex: false,
    openclaude: false,
    crewai: false,
  },
};
