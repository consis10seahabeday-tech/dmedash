import pandas as pd
import os

def update_or_create_spreadsheet(file_path, new_data_dict):
    """
    Updates an existing Excel file with new data or creates a new one.
    
    Args:
        file_path (str): The path to the .xlsx file.
        new_data_dict (dict): Data to add, e.g., {'Issue': ['DB Timeout'], 'Category': ['Database']}
    """
    # Convert input dictionary to a DataFrame
    new_df = pd.DataFrame(new_data_dict)

    if os.path.exists(file_path):
        # Read the existing data
        existing_df = pd.read_excel(file_path)
        
        # Combine existing and new data (appending new rows)
        updated_df = pd.concat([existing_df, new_df], ignore_index=True)
        print(f"Updating existing file: {file_path}")
    else:
        # If file doesn't exist, the new data is our starting point
        updated_df = new_df
        print(f"Creating new file: {file_path}")

    # Save to Excel (engine='openpyxl' is the modern standard)
    updated_df.to_excel(file_path, index=False, engine='openpyxl')
    print("Success: Spreadsheet saved.")

# --- Example Usage ---
data = {
    'RCA_ID': [101],
    'Description': ['Connection pool exhausted in production'],
    'Category': ['Database Problems']
}

update_or_create_spreadsheet('rca_logs.xlsx', data)