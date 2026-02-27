import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { type BriefingResult, buildPrompt, extractReferences } from './glean';

export async function generateClaudeBriefing(
  site: Record<string, unknown>,
  scope?: string
): Promise<BriefingResult> {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Add it to your .env file.');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const prompt = buildPrompt(site, scope);

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    system: 'You are a government digital services analyst preparing a professional briefing document. Respond only with the briefing content in markdown format as instructed.',
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('\n\n');

  if (!content) {
    throw new Error('Claude returned an empty response.');
  }

  return {
    full_markdown: content,
    references: extractReferences(content),
    model: message.model,
    prompt_tokens: message.usage.input_tokens,
    completion_tokens: message.usage.output_tokens,
  };
}
