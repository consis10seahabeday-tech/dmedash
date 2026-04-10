from transformers import pipeline

# 1. Initialize the summarization pipeline
# 'sshleifer/distilbart-cnn-12-6' is fast and great for short texts
summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")

def summarize_text(text):
    # Validation for your requirements
    if len(text) < 150 or len(text) > 400:
        return "Error: Input must be between 150 and 400 characters."

    # 2. Generate summary
    # max_length is in tokens, roughly 1 token = 4 characters. 
    # To stay under 101 characters, we set max_length low (approx 20-25 tokens).
    summary = summarizer(text, max_length=25, min_length=5, do_sample=False)
    
    result = summary[0]['summary_text']
    
    # 3. Final trim to ensure strict < 101 character limit
    if len(result) >= 101:
        result = result[:97] + "..."
        
    return result

# Example Usage
input_text = ("Artificial Intelligence is transforming the world by enabling "
              "machines to learn from experience and perform human-like tasks. "
              "From self-driving cars to medical diagnoses, AI is becoming "
              "an essential part of modern technology and daily life.")

print(f"Original Length: {len(input_text)}")
print(f"Summary: {summarize_text(input_text)}")
print(f"Summary Length: {len(summarize_text(input_text))}")

#v2
import re
from collections import Counter

def simple_summarizer(text, max_chars=100):
    if len(text) < 150:
        return text[:max_chars]

    # 1. Basic Cleaning & Tokenization
    # We define a small list of stopwords manually to avoid downloading NLTK data
    stopwords = set(["the", "and", "is", "in", "it", "of", "to", "for", "with", "on", "at", "by", "an", "be"])
    
    # Split into sentences (simple split by punctuation)
    sentences = re.split(r'(?<=[.!?]) +', text)
    
    # Split into words and count frequencies
    words = re.findall(r'\w+', text.lower())
    word_counts = Counter(word for word in words if word not in stopwords)
    
    # 2. Score Sentences
    sentence_scores = {}
    for sentence in sentences:
        for word in re.findall(r'\w+', sentence.lower()):
            if word in word_counts:
                sentence_scores[sentence] = sentence_scores.get(sentence, 0) + word_counts[word]
    
    # 3. Get the top sentence
    if not sentence_scores:
        return text[:max_chars]
        
    best_sentence = max(sentence_scores, key=sentence_scores.get)
    
    # 4. Enforce strict character limit
    if len(best_sentence) > max_chars:
        return best_sentence[:max_chars-3].strip() + "..."
    
    return best_sentence

# Example usage
raw_text = ("The renewable energy sector is growing rapidly as countries strive to reduce carbon emissions. "
            "Solar and wind power are now cheaper than coal in many regions. "
            "This shift is essential for combating climate change and ensuring a sustainable future.")

summary = simple_summarizer(raw_text)
print(f"Summary ({len(summary)} chars): {summary}")