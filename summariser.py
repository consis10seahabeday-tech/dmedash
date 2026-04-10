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