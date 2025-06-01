// src/pages/Home.jsx
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // If the URL contains ?host=true, immediately redirect to /host
  useEffect(() => {
    if (searchParams.get('host') === 'true') {
      navigate('/host', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 bg-slate-900 text-white">
      <h1 className="text-5xl font-bold mb-8">발로란트 픽밴 로비</h1>
      <div className="flex flex-col gap-4">

        {/* “Join a Lobby” goes directly to /join */}
        <button
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
          onClick={() => navigate('/join')}
        >
          로비 참가
        </button>
      </div>
    </div>
  );
}
