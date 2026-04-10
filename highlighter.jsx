import React, { useState, useEffect, useMemo } from 'react';

const TextHighlightPage = ({ rawText }) => {
  const [importanceScore, setImportanceScore] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchImportance = async () => {
      if (!rawText || rawText.length < 150) return;
      
      setLoading(true);
      try {
        const response = await fetch('http://localhost:8000/analyze-importance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: rawText }),
        });
        
        const data = await response.json();
        // data.importance_results is [{phrase: "...", score: 0.12}, ...]
        setImportanceScore(data.importance_results);
      } catch (err) {
        console.error("Analysis failed", err);
      } finally {
        setLoading(false);
      }
    };

    fetchImportance();
  }, [rawText]);

  // Helper function to render text with highlights
  const highlightedText = useMemo(() => {
    if (!importanceScore || importanceScore.length === 0) return rawText;

    let tempText = rawText;
    
    // Sort scores so longer phrases are replaced first (prevents partial matching issues)
    const sortedScores = [...importanceScore].sort((a, b) => b.phrase.length - a.phrase.length);

    // Create a regex to match all keywords/phrases
    const pattern = sortedScores.map(item => item.phrase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${pattern})`, 'gi');

    // Split text by keywords and map them to styled components
    return rawText.split(regex).map((part, index) => {
      const match = sortedScores.find(s => s.phrase.toLowerCase() === part.toLowerCase());
      
      if (match) {
        // YAKE: 0 is important, 1 is unimportant. 
        // We invert it for CSS opacity (0.1 score -> 0.9 opacity)
        const opacity = Math.max(0.2, 1 - match.score).toFixed(2);
        
        return (
          <span 
            key={index} 
            style={{ 
              backgroundColor: `rgba(255, 255, 0, ${opacity})`, // Yellow highlight
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
      <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
        {highlightedText}
      </div>
    </div>
  );
};

export default TextHighlightPage;