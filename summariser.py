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

#v3
import os
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline

# 1. Your Artifactory details
model_id = "sshleifer/distilbart-cnn-12-6"

# 2. Explicitly load the model and tokenizer
# This bypasses the 'Unknown Task' error entirely
print("Loading model from Artifactory...")
tokenizer = AutoTokenizer.from_pretrained(model_id, token=True)
model = AutoModelForSeq2SeqLM.from_pretrained(model_id, token=True)

# 3. Create the pipeline by passing the objects directly
# We still give it a name, but since we provide the model, it's more stable
summarizer = pipeline("summarization", model=model, tokenizer=tokenizer)

# 4. Your target text
text = "Replace this with your 150-500 character paragraph."

# 5. Generate with character-limit logic
# max_new_tokens=25 ensures the output stays very short (under 101 chars)
output = summarizer(
    text, 
    max_new_tokens=25, 
    min_new_tokens=5, 
    do_sample=False
)

print("-" * 30)
print("Final Summary:")
print(output[0]['summary_text'])
print(f"Character Count: {len(output[0]['summary_text'])}")


#v4
from transformers import pipeline

# If your Artifactory mirrors Hugging Face, use the model name.
# If you found it in your local registry, replace with that path.
model_name = "Falconsai/text_summarization"

try:
    # Set framework to 'pt' (PyTorch) for typical banking IT environments
    summarizer = pipeline("summarization", model=model_name, framework="pt")

    def get_summary(text):
        # We set max_length very low (20-25 tokens) to hit your <101 char goal
        # T5-small models generally produce ~4 chars per token
        summary = summarizer(text, max_length=25, min_length=5, do_sample=False)
        result = summary[0]['summary_text']
        
        # Enforce strict 100 character safety limit
        return result[:100] if len(result) > 100 else result

    # Test
    my_input = ("The banking sector is increasingly adopting AI to automate "
                "routine tasks and improve risk assessment. This shift "
                "allows junior developers to focus on building complex "
                "Retrieval-Augmented Generation systems for internal use.")
    
    print(f"Summary: {get_summary(my_input)}")

except Exception as e:
    print(f"Could not load model: {e}")

#v5
import re
from collections import Counter

def summarizer_offline(text):
    # 1. Split into sentences using regex (no NLTK needed)
    # This looks for punctuation followed by a space
    sentences = re.split(r'(?<=[.!?]) +', text)
    
    # 2. Simple word scoring
    # We filter out common short words manually
    stop_words = {'the', 'and', 'is', 'in', 'it', 'to', 'of', 'for', 'with', 'on', 'at', 'by', 'an', 'this', 'that'}
    words = re.findall(r'\w+', text.lower())
    
    # Count frequency of "important" words
    freq_table = Counter(word for word in words if word not in stop_words)
    
    # 3. Score each sentence based on word frequency
    sent_scores = {}
    for sentence in sentences:
        for word in re.findall(r'\w+', sentence.lower()):
            if word in freq_table:
                sent_scores[sentence] = sent_scores.get(sentence, 0) + freq_table[word]
    
    # 4. Pick the top sentence
    if not sent_scores:
        return text[:100]
        
    summary = max(sent_scores, key=sent_scores.get)
    
    # 5. Strict character limit check
    if len(summary) > 100:
        return summary[:97].strip() + "..."
        
    return summary

# Example
text_input = "AI is changing the banking industry by automating data entry. Junior developers are now building RAG systems to handle complex queries. This improves efficiency across the entire firm."
print(summarizer_offline(text_input))