import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

interface BotProfile {
  displayName: string;
  bio: string;
  lookingFor: string;
  socialProfile: string | null;
  interests: string[] | null;
  portrait: string | null;
}

interface OtherProfile {
  displayName: string;
  bio: string;
  lookingFor: string;
  socialProfile: string | null;
}

interface MessageEntry {
  senderId: string;
  content: string;
}

const FALLBACK_OPENING = 'Hej! Milo mi :)';
const FALLBACK_REPLY = 'Fajnie, opowiedz wiecej!';

export async function generateBotMessage(
  botProfile: BotProfile,
  otherProfile: OtherProfile,
  conversationHistory: MessageEntry[],
  isOpening: boolean,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return isOpening ? FALLBACK_OPENING : FALLBACK_REPLY;
  }

  const botDesc = botProfile.socialProfile || botProfile.bio;
  const botInterests = botProfile.interests?.join(', ') || 'brak danych';
  const botPortrait = botProfile.portrait || 'brak';
  const otherDesc = otherProfile.socialProfile || otherProfile.bio;

  const scenario = isOpening
    ? 'Pierwsza wiadomosc po zaakceptowaniu wave. Przywitaj sie nawiazujac do tego co was laczy.'
    : `Kontynuujesz rozmowe. Odpowiedz na ostatnia wiadomosc.\n\nOstatnie wiadomosci:\n${conversationHistory
        .slice(-10)
        .map((m) => `${m.senderId === 'bot' ? botProfile.displayName : otherProfile.displayName}: ${m.content}`)
        .join('\n')}`;

  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      temperature: 0.9,
      maxOutputTokens: 150,
      system: `Jestes ${botProfile.displayName}. Piszesz na czacie w aplikacji Blisko.

Twoj profil: ${botDesc}
Czego szukasz: ${botProfile.lookingFor}
Twoje zainteresowania: ${botInterests}
Twoj portret: ${botPortrait}

Profil rozmowcy (${otherProfile.displayName}): ${otherDesc}
Czego szuka rozmowca: ${otherProfile.lookingFor}

Zasady:
- Pisz po polsku, potocznie
- 1-3 zdania, max 200 znakow
- Nie naduzywaj emoji
- Nawiazuj do wspolnych zainteresowań, zadawaj pytania
- Jezeli rozmowca porusza tematy bliskie Twoim zainteresowaniom, preferencjom lub temu czego szukasz — odpowiadaj z wiekszym zaangazowaniem, entuzjazmem, rozwijaj watek i zadawaj pytania
- Jezeli temat jest Ci obcy lub nie zwiazany z Twoim profilem — odpowiadaj krotko, grzecznie ale bez entuzjazmu, nie rozwijaj watku`,
      prompt: scenario,
    });

    return text.slice(0, 200) || (isOpening ? FALLBACK_OPENING : FALLBACK_REPLY);
  } catch (error) {
    console.error('[bot] AI generation error:', error);
    return isOpening ? FALLBACK_OPENING : FALLBACK_REPLY;
  }
}
