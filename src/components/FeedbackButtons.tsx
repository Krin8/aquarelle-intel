'use client';

import { submitFeedback } from '@/actions/ai-actions';
import { useRouter } from 'next/navigation';

export function FeedbackButtons({
  analysisId,
  currentRating,
}: {
  analysisId: string;
  currentRating: string | null;
}) {
  const router = useRouter();

  async function handleFeedback(rating: 'thumbs_up' | 'thumbs_down') {
    await submitFeedback(analysisId, rating);
    router.refresh();
  }

  return (
    <>
      <button
        className={`feedback-btn ${currentRating === 'thumbs_up' ? 'active-up' : ''}`}
        onClick={() => handleFeedback('thumbs_up')}
      >
        👍 Helpful
      </button>
      <button
        className={`feedback-btn ${currentRating === 'thumbs_down' ? 'active-down' : ''}`}
        onClick={() => handleFeedback('thumbs_down')}
      >
        👎 Not useful
      </button>
    </>
  );
}
