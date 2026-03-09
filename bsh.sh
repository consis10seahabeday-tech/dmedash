#!/bin/bash

STATUS_FILE="dailyStatus.txt"
CONTENT_FILE="mailContent"
TEMP_FILE="mailContent.tmp"

# Check if files exist to avoid errors
if [[ ! -f "$STATUS_FILE" || ! -f "$CONTENT_FILE" ]]; then
    echo "Error: Ensure both $STATUS_FILE and $CONTENT_FILE exist."
    exit 1
fi

# AWK processes the data:
# 1. Loads the status list into an array (memory)
# 2. Iterates through the table and checks Column 1
awk '
    # Load dailyStatus.txt into a lookup table (array)
    FNR == NR { 
        status_exists[$1] = 1; 
        next 
    }
    
    # Process the mailContent file
    FNR == 1 { print $0; next } # Print header
    {
        if ($1 in status_exists) {
            $4 = "done"
        } else {
            $4 = "not_done"
        }
        # Print with clean column spacing
        printf "%-10s %-10s %-6s %-10s\n", $1, $2, $3, $4
    }
' "$STATUS_FILE" "$CONTENT_FILE" > "$TEMP_FILE"

# Overwrite original with the updated table
mv "$TEMP_FILE" "$CONTENT_FILE"

echo "--- Updated mailContent Table ---"
cat "$CONTENT_FILE"