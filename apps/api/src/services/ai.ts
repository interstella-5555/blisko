import OpenAI from 'openai';

// Lazy initialization to avoid errors when API key is not set
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openaiClient;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();

  if (!client) {
    console.warn('OPENAI_API_KEY not set, returning empty embedding');
    return [];
  }

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return [];
  }
}
