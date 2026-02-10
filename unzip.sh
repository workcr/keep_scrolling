#!/bin/bash
echo "Unzipping dist.zip..."
if [ ! -f "dist.zip" ]; then
    echo "Error: dist.zip not found!"
    exit 1
fi

unzip -q "dist.zip"
echo "Done! Files extracted successfully."
