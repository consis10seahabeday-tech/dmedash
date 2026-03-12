
joy <sanjothattil@gmail.com>
6:14 PM (1 minute ago)
to me

#!/bin/bash

# Assume your 'files' array is already populated
# files=(wrk/file1.txt wrk/file2.txt)

REFERENCE_FILE="data_list.txt"
TEMP_FILE="data_list.tmp"

for full_path in "${files[@]}"; do
    # 1. Get just the filename (e.g., "filename.txt")
    fname=$(basename "$full_path")

    echo "Processing match for: $fname"

    # 2. Use awk to find and replace
    # -v passes our bash variable into awk
    awk -v target="$fname" '{
        if ($1 == target) {
            # Manipulate the 2nd word (example: change it to "PROCESSED")
            $2 = "PROCESSED" 
        }
        print $0
    }' "$REFERENCE_FILE" > "$TEMP_FILE"

    # 3. Overwrite the original file with the updated version
    mv "$TEMP_FILE" "$REFERENCE_FILE"
done

echo "Update complete.