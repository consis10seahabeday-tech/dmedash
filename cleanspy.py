import pandas as pd
import re

def clean_incident_data(input_file, output_file):
    # 1. Load the spreadsheet
    df = pd.read_excel(input_file)
    
    initial_count = len(df)
    print(f"Original records: {initial_count}")

    # 2. Filter incidentId: Must start with 'INC' followed by digits only
    # We use a regex: ^INC\d+$ 
    # (^ starts with, INC literal, \d+ one or more digits, $ ends there)
    df = df[df['incidentId'].astype(str).str.match(r'^INC\d+$', na=False)]
    
    after_format_filter = len(df)
    print(f"Records after ID format validation: {after_format_filter}")

    # 3. Handle duplicates: Keep only the latest row for each incidentId
    # 'keep=last' assumes the latest entry is at the bottom of the sheet
    df = df.drop_duplicates(subset=['incidentId'], keep='last')
    
    final_count = len(df)
    print(f"Records after removing duplicates: {final_count}")
    print(f"Total rows removed: {initial_count - final_count}")

    # 4. Save to a new spreadsheet
    df.to_excel(output_file, index=False)
    print(f"Cleaned data saved to: {output_file}")

# Execute the function
clean_incident_data('INC Training.xlsx', 'Cleaned_INC_Training.xlsx')