#!/bin/sh
# Cookie setup helper for Docker/Portainer deployments
# Run this from Portainer console to easily add cookies

echo "========================================="
echo "YouTube Cookies Setup"
echo "========================================="
echo ""
echo "This script will help you add YouTube cookies for age-restricted content."
echo ""

# Check if cookies already exist
if [ -f "/app/cookies.txt" ]; then
    echo "✓ cookies.txt already exists"
    echo "  First 3 lines:"
    head -3 /app/cookies.txt
    echo ""
    read -p "Do you want to replace it? (y/N): " replace
    if [ "$replace" != "y" ] && [ "$replace" != "Y" ]; then
        echo "Keeping existing cookies.txt"
        exit 0
    fi
fi

echo ""
echo "Choose setup method:"
echo "1) Paste base64-encoded cookies (recommended)"
echo "2) Enter cookie data manually (advanced)"
echo ""
read -p "Enter choice (1-2): " choice

case $choice in
    1)
        echo ""
        echo "On your computer:"
        echo "1. Export cookies from YouTube using browser extension"
        echo "2. Run this PowerShell command:"
        echo "   [Convert]::ToBase64String([System.IO.File]::ReadAllBytes('cookies.txt')) | Set-Clipboard"
        echo "3. Paste the base64 string below"
        echo ""
        read -p "Paste base64 string: " base64_data

        if [ -z "$base64_data" ]; then
            echo "Error: No data provided"
            exit 1
        fi

        echo "$base64_data" | base64 -d > /app/cookies.txt

        if [ $? -eq 0 ] && [ -f "/app/cookies.txt" ]; then
            echo "✓ Cookies saved successfully!"
            echo "  File size: $(wc -c < /app/cookies.txt) bytes"
            echo "  Lines: $(wc -l < /app/cookies.txt)"
        else
            echo "✗ Failed to decode base64 data"
            exit 1
        fi
        ;;
    2)
        echo ""
        echo "Enter cookie lines (paste and press Ctrl+D when done):"
        cat > /app/cookies.txt
        echo "✓ Cookies saved"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

# Set permissions
chmod 644 /app/cookies.txt

echo ""
echo "========================================="
echo "Setup complete!"
echo "Restart the bot for changes to take effect."
echo "========================================="
