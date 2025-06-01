// src/components/MapCard.jsx
import React from 'react';

export default function MapCard({ name, disabled, onClick }) {
  return (
    <button
      onClick={() => {
        if (!disabled) onClick(name);
      }}
      disabled={disabled}
      className={`w-full p-4 border rounded-lg text-left transition ${
        disabled
          ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
          : 'bg-slate-800 hover:bg-slate-700 text-white'
      }`}
    >
      {name}
    </button>
  );
}
