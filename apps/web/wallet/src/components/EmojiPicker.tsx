'use client';

import React, { useState } from 'react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗', '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩', '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '🥴', '😠', '😡', '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧'],
  'Gestures': ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  'Money': ['💰', '💴', '💵', '💶', '💷', '💸', '💳', '🪙', '💎', '⚖️'],
  'Objects': ['📱', '💻', '⌚', '📷', '🔑', '🔒', '🔓', '🔔', '📧', '📨', '📩', '📫', '📪', '📬', '📭', '📮', '🗳', '✏️', '✒️', '🖊', '🖋', '📝', '💼', '📂', '📁', '🗂', '📅', '📆', '🗒', '🗓'],
  'Symbols': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '✨', '⭐', '🌟', '💫', '⚡', '🔥', '💥', '✅', '❌', '⚠️', '🚫', '💯', '🔰'],
};

export default function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof EMOJI_CATEGORIES>('Smileys');

  return (
    <div className="border rounded-lg bg-white shadow-lg p-3 w-full max-w-md">
      {/* Category Tabs */}
      <div className="flex gap-2 mb-3 overflow-x-auto">
        {(Object.keys(EMOJI_CATEGORIES) as Array<keyof typeof EMOJI_CATEGORIES>).map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-3 py-1 rounded-lg text-sm whitespace-nowrap ${
              selectedCategory === category
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Emoji Grid */}
      <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto">
        {EMOJI_CATEGORIES[selectedCategory].map((emoji, index) => (
          <button
            key={index}
            onClick={() => onSelect(emoji)}
            className="text-2xl hover:bg-gray-100 rounded p-1 transition-colors"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
