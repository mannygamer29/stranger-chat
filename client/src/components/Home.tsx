import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface UserPreferences {
  tags: string[];
  language: string;
  ageGroup: string;
  agreeToGuidelines: boolean;
  isVideoChat: boolean;
}

const AVAILABLE_TAGS = [
  'Gaming', 'Movies', 'Music', 'Sports', 'Technology',
  'Art', 'Books', 'Travel', 'Food', 'Fitness',
  'Science', 'Politics', 'Fashion', 'Photography',
  'Coding', 'Anime', 'Nature', 'History', 'Philosophy'
];

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Chinese',
  'Japanese', 'Korean', 'Russian', 'Portuguese', 'Italian'
];

const AGE_GROUPS = [
  '13-17', '18-24', '25-34', '35-44', '45+'
];

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<UserPreferences>({
    tags: [],
    language: 'English',
    ageGroup: '18-24',
    agreeToGuidelines: false,
    isVideoChat: false
  });
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Apply dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const toggleTag = (tag: string) => {
    setPreferences(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (customTag.trim() && !preferences.tags.includes(customTag.trim())) {
      setPreferences(prev => ({
        ...prev,
        tags: [...prev.tags, customTag.trim()]
      }));
      setCustomTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setPreferences(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleStartChat = () => {
    if (!preferences.agreeToGuidelines) {
      alert('Please read and agree to the chat guidelines before starting.');
      return;
    }
    if (preferences.tags.length === 0) {
      alert('Please select at least one interest tag.');
      return;
    }
    if (preferences.isVideoChat) {
      // Check if browser supports video chat
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Your browser does not support video chat. Please use a modern browser or try text chat instead.');
        return;
      }
      // Request camera/mic permissions early
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(() => {
          localStorage.setItem('chatPreferences', JSON.stringify(preferences));
          navigate('/chat');
        })
        .catch((err) => {
          console.error('Error accessing media devices:', err);
          alert('Could not access camera or microphone. Please check your permissions or try text chat instead.');
        });
    } else {
      localStorage.setItem('chatPreferences', JSON.stringify(preferences));
      navigate('/chat');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8 px-4 transition-colors duration-200">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors duration-200">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white">Stranger Chat</h1>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
            >
              {darkMode ? '🌞' : '🌙'}
            </button>
          </div>
          
          {/* Language Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Preferred Language
            </label>
            <select
              value={preferences.language}
              onChange={(e) => setPreferences(prev => ({ ...prev, language: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              {LANGUAGES.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          {/* Age Group Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Age Group
            </label>
            <select
              value={preferences.ageGroup}
              onChange={(e) => setPreferences(prev => ({ ...prev, ageGroup: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              {AGE_GROUPS.map(age => (
                <option key={age} value={age}>{age}</option>
              ))}
            </select>
          </div>

          {/* Interest Tags */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Your Interests (Choose at least one)
            </label>
            
            {/* Custom Tag Input */}
            <form onSubmit={handleAddCustomTag} className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  placeholder="Add custom tag..."
                  className="flex-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={!customTag.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </form>

            {/* Selected Tags */}
            {preferences.tags.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Selected Tags:</h3>
                <div className="flex flex-wrap gap-2">
                  {preferences.tags.map(tag => (
                    <div
                      key={tag}
                      className="group flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded-full text-sm font-medium"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="text-white hover:text-red-200 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available Tags */}
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors
                    ${preferences.tags.includes(tag)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Chat Type
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={!preferences.isVideoChat}
                  onChange={() => setPreferences(prev => ({ ...prev, isVideoChat: false }))}
                  className="text-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
                <span className="text-gray-700 dark:text-gray-300">Text Chat</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={preferences.isVideoChat}
                  onChange={() => setPreferences(prev => ({ ...prev, isVideoChat: true }))}
                  className="text-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
                <span className="text-gray-700 dark:text-gray-300">Video Chat</span>
              </label>
            </div>
            {preferences.isVideoChat && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Note: Video chat requires camera and microphone access. Your browser will ask for permission.
              </p>
            )}
          </div>

          {/* Guidelines */}
          <div className="mb-6">
            <button
              onClick={() => setShowGuidelines(!showGuidelines)}
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
            >
              {showGuidelines ? 'Hide' : 'Show'} Chat Guidelines
            </button>
            {showGuidelines && (
              <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300">
                <h3 className="font-medium mb-2">Chat Guidelines:</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Be respectful and kind to others</li>
                  <li>No hate speech or discrimination</li>
                  <li>No sharing of personal information</li>
                  <li>No explicit or inappropriate content</li>
                  <li>Report any violations using the report button</li>
                  <li>You can skip to a new stranger at any time</li>
                </ul>
              </div>
            )}
          </div>

          {/* Agreement Checkbox */}
          <div className="mb-6">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={preferences.agreeToGuidelines}
                onChange={(e) => setPreferences(prev => ({ ...prev, agreeToGuidelines: e.target.checked }))}
                className="rounded text-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                I have read and agree to the chat guidelines
              </span>
            </label>
          </div>

          {/* Start Chat Button */}
          <button
            onClick={handleStartChat}
            className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium
              hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed
              dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-400 dark:focus:ring-offset-gray-800"
            disabled={!preferences.agreeToGuidelines || preferences.tags.length === 0}
          >
            Start Chatting
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home; 