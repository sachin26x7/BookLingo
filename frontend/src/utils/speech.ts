import toast from 'react-hot-toast';

export const speakText = (text: string): void => {
  const phrase = text.trim();
  if (!phrase) return;

  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    toast.error('Speech playback is not supported by this browser.');
    return;
  }

  const synthesis = window.speechSynthesis;
  synthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = 'en-US';
  const voices = synthesis.getVoices();
  const englishVoice = voices.find((voice) => voice.lang.toLowerCase() === 'en-us')
    || voices.find((voice) => voice.lang.toLowerCase().startsWith('en-'));
  if (englishVoice) utterance.voice = englishVoice;

  utterance.onerror = (event) => {
    if (event.error !== 'canceled' && event.error !== 'interrupted') {
      toast.error('Pronunciation could not be played. Check your device speech settings.');
    }
  };

  synthesis.speak(utterance);
};