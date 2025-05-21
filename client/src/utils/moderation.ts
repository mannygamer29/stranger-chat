// List of banned words (using partial matches to catch variations)
export const BANNED_WORDS = [
  'n1gg', 'n1gger', 'n1gga', 'n1ggas', 'n1ggers', // n-word variations
  'r3tard', 'r3tarded', // r-word variations
  'f4ggot', 'f4g', // f-word variations
  'k1ke', // k-word variations
  'sp1c', 'sp1ck', // s-word variations
  'ch1nk', // c-word variations
  'w3tback', // w-word variations
  't0welhead', // t-word variations
  'g00k', // g-word variations
  'd1ke', // d-word variations
  'tr4nny', // t-word variations
  'wh0re', 'slut', // derogatory terms
  'n4zi', 'n4zis', // hate speech
  'terrorist', 'terrorism', // potentially harmful terms
];

// Function to check if a message contains banned words
export const containsBannedWords = (message: string): boolean => {
  const normalizedMessage = message.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BANNED_WORDS.some(word => {
    const normalizedWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedMessage.includes(normalizedWord);
  });
};

// Function to filter out banned words from a message
export const filterMessage = (message: string): string => {
  if (!containsBannedWords(message)) {
    return message;
  }
  
  let filteredMessage = message;
  BANNED_WORDS.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filteredMessage = filteredMessage.replace(regex, '***');
  });
  
  return filteredMessage;
}; 