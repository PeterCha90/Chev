import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { ollama } from 'ollama-ai-provider';
// import { isTestEnvironment } from '../constants';

// Ollama 서버 URL 설정
// process.env.OLLAMA_HOST = 'http://localhost:11434';

// tools를 지원하는 모델로 변경
const DEFAULT_MODEL = 'qwen2.5:7b';

export const myProvider = customProvider({
  languageModels: {
    'chat-model': ollama(DEFAULT_MODEL),
    'chat-model-reasoning': wrapLanguageModel({
      model: ollama(DEFAULT_MODEL),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    'title-model': ollama(DEFAULT_MODEL),
    'artifact-model': ollama(DEFAULT_MODEL),
  },
});
