import React, { useState, useEffect, useMemo, ReactNode } from 'react';

// 1. Define the structure of a single YAKE result
interface YakeResult {
  phrase: string;
  score: number;
}

// 2. Define the props for the component
interface TextHighlightPageProps {
  rawText: string;
}

const TextHighlightPage: React.FC<TextHighlightPageProps> = ({ rawText }) => {
  // State is typed as an array of YakeResult or null
  const [importanceScore, setImportanceScore] = useState<YakeResult[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchImportance = async (): Promise<void> => {
      if (!rawText || rawText.length < 150) return;
      
      setLoading(true);
      try {
        const response = await fetch('http://localhost:8000/analyze-importance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: rawText }),
        });
        
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        // Assuming your API returns { importance_results: [...] }
        setImportanceScore(data.importance_results);
      } catch (err) {
        console.error("Analysis failed", err);
      } finally {
        setLoading(false);
      }
    };

    fetchImportance();
  }, [rawText]);

  // 3. Typed useMemo returning an array of ReactNodes (strings or JSX elements)
  const highlightedText = useMemo((): ReactNode[] | string => {
    if (!importanceScore || importanceScore.length === 0) return rawText;

    // Sort to handle overlapping phrases (longest first)
    const sortedScores: YakeResult[] = [...importanceScore].sort(
      (a, b) => b.phrase.length - a.phrase.length
    );

    // Escape regex special characters
    const pattern: string = sortedScores
      .map(item => item.phrase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .join('|');
    
    const regex = new RegExp(`(${pattern})`, 'gi');

    return rawText.split(regex).map((part, index): ReactNode => {
      const match = sortedScores.find(
        (s) => s.phrase.toLowerCase() === part.toLowerCase()
      );
      
      if (match) {
        // Opacity logic: lower YAKE score = higher importance
        const opacity: string = Math.max(0.2, 1 - match.score).toFixed(2);
        
        return (
          <span 
            key={`${match.phrase}-${index}`} 
            style={{ 
              backgroundColor: `rgba(255, 255, 0, ${opacity})`,
              fontWeight: match.score < 0.1 ? 'bold' : 'normal',
              borderRadius: '3px',
              padding: '0 2px'
            }}
            title={`Score: ${match.score}`}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  }, [rawText, importanceScore]);

  return (
    <div style={{ padding: '20px', lineHeight: '1.8', fontFamily: 'sans-serif' }}>
      <h2>Document Analysis</h2>
      {loading && <p>Analyzing importance...</p>}
      <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', minHeight: '100px' }}>
        {highlightedText}
      </div>
    </div>
  );
};

export default TextHighlightPage;