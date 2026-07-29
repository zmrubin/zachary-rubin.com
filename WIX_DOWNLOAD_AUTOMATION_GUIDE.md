# Wix Site Files - Automated Download Guide

## Overview
This guide provides multiple methods to progressively download all files from your Wix Site Files backup (375 MB total).

---

## Method 1: Manual Progressive Download (Recommended for first-time backup)

### Step-by-Step Instructions

1. **Open Wix Editor**
   - Go to: https://zacharymrubin-my-site.editor.wix.com/
   - Click on the Media icon in the left sidebar

2. **Access Site Files**
   - In the Media panel, locate "Site Files"
   - Click "Show More" to open the full file browser

3. **Download Files by Type**
   - Start with one file type (e.g., all images first)
   - Right-click each file → Select "Download"
   - Files will download to your Downloads folder

4. **Organize Downloads**
   - Create folders: `Images/`, `Videos/`, `PDFs/`, `Other/`
   - Move downloaded files into appropriate folders

5. **Track Progress**
   - Open `WIX_SITE_FILES_DOWNLOAD_GUIDE.html` in your browser
   - Check each file as you download it
   - Progress is saved in browser storage

---

## Method 2: Browser Console Automation (Advanced)

### Using JavaScript to Batch Download

1. **Open Browser Developer Tools**
   - Press `F12` or `Cmd+Option+I` (Mac)
   - Go to the "Console" tab

2. **Copy and Paste This Script**
   ```javascript
   // Wix Site Files Auto-Download Script
   const downloadFile = (fileName) => {
       // Finds and downloads a file by name
       const fileElements = document.querySelectorAll('[class*="file"]');
       fileElements.forEach(el => {
           if (el.textContent.includes(fileName)) {
               el.click();
               // Wait before triggering download
               setTimeout(() => {
                   document.contextMenu?.click();
               }, 500);
           }
       });
   };

   // Trigger downloads for all visible files
   const allFiles = Array.from(document.querySelectorAll('img, video, [role="img"]'));
   let delay = 0;
   allFiles.forEach((file, index) => {
       setTimeout(() => {
           file.rightClick?.();
           console.log(`Processing file ${index + 1} of ${allFiles.length}`);
       }, delay);
       delay += 2000; // 2 second delay between downloads
   });

   console.log("Download batch started. Check your Downloads folder!");
   ```

3. **Press Enter** and wait for the script to complete

---

## Method 3: Using curl/wget from Terminal (Advanced)

### Prerequisites
- Terminal/Command Prompt access
- curl or wget installed

### Script

1. **Create a download script** (`download_wix_files.sh`)
   ```bash
   #!/bin/bash

   # Wix Site Files Download Script
   # Usage: ./download_wix_files.sh

   DOWNLOAD_DIR="~/Downloads/WIX_Backup"
   mkdir -p "$DOWNLOAD_DIR"

   # Array of file URLs from Wix (you'll need to get these from the browser)
   FILES=(
       "https://static.wixstatic.com/..." # Replace with actual URLs
       "https://static.wixstatic.com/..."
   )

   echo "Starting Wix backup download..."
   echo "Total files: ${#FILES[@]}"
   echo "Destination: $DOWNLOAD_DIR"

   COUNT=0
   for FILE_URL in "${FILES[@]}"; do
       COUNT=$((COUNT + 1))
       echo "[$COUNT/${#FILES[@]}] Downloading..."
       curl -o "$DOWNLOAD_DIR/file_$COUNT" "$FILE_URL" \
           --progress-bar \
           --retry 3 \
           --retry-delay 2
       sleep 1  # Delay between downloads
   done

   echo "Download complete! Files saved to: $DOWNLOAD_DIR"
   ```

2. **Make it executable**
   ```bash
   chmod +x download_wix_files.sh
   ```

3. **Run it**
   ```bash
   ./download_wix_files.sh
   ```

---

## Method 4: Python Script for Batch Download

### Prerequisites
- Python 3.6+
- requests library: `pip install requests`

### Script

Create `download_wix_files.py`:

```python
#!/usr/bin/env python3

import os
import requests
import json
from datetime import datetime
from pathlib import Path
import time

class WixBackupDownloader:
    def __init__(self, download_dir="~/Downloads/WIX_Backup"):
        self.download_dir = Path(download_dir).expanduser()
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.manifest = {
            "timestamp": datetime.now().isoformat(),
            "total_files": 0,
            "downloaded_files": 0,
            "failed_files": 0,
            "files": []
        }

    def download_file(self, url, filename, retries=3):
        """Download a single file with retry logic"""
        filepath = self.download_dir / filename
        
        for attempt in range(retries):
            try:
                print(f"Downloading: {filename} (Attempt {attempt + 1}/{retries})", end="... ")
                response = requests.get(url, stream=True, timeout=30)
                response.raise_for_status()
                
                with open(filepath, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                file_size = filepath.stat().st_size
                print(f"✓ ({file_size:,} bytes)")
                return True
                
            except requests.exceptions.RequestException as e:
                print(f"✗ Error: {str(e)[:50]}")
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                    
        return False

    def save_manifest(self):
        """Save download manifest"""
        manifest_path = self.download_dir / "manifest.json"
        with open(manifest_path, 'w') as f:
            json.dump(self.manifest, f, indent=2)
        print(f"\nManifest saved: {manifest_path}")

    def generate_report(self):
        """Generate download report"""
        print("\n" + "="*60)
        print("DOWNLOAD REPORT")
        print("="*60)
        print(f"Timestamp: {self.manifest['timestamp']}")
        print(f"Total Files: {self.manifest['total_files']}")
        print(f"Successfully Downloaded: {self.manifest['downloaded_files']}")
        print(f"Failed: {self.manifest['failed_files']}")
        success_rate = (self.manifest['downloaded_files'] / self.manifest['total_files'] * 100) \
                      if self.manifest['total_files'] > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        print(f"Location: {self.download_dir}")
        print("="*60 + "\n")

# Usage Example:
if __name__ == "__main__":
    downloader = WixBackupDownloader()
    
    # Example files - Replace with your actual file URLs from Wix
    files_to_download = [
        # ("URL", "filename"),
        # Add your files here
    ]
    
    print(f"Starting Wix backup download to: {downloader.download_dir}")
    print(f"Total files to download: {len(files_to_download)}\n")
    
    downloader.manifest['total_files'] = len(files_to_download)
    
    for url, filename in files_to_download:
        if downloader.download_file(url, filename):
            downloader.manifest['downloaded_files'] += 1
            downloader.manifest['files'].append({
                "filename": filename,
                "status": "success"
            })
        else:
            downloader.manifest['failed_files'] += 1
            downloader.manifest['files'].append({
                "filename": filename,
                "status": "failed"
            })
        
        time.sleep(0.5)  # Delay between downloads
    
    downloader.save_manifest()
    downloader.generate_report()
```

---

## File Inventory from Your Site

### Total Storage: 375 MB / 50 GB

### File Breakdown

| Type | Count | Estimated Size |
|------|-------|-----------------|
| Screenshots | 8 | ~5 MB |
| Images | 8 | ~8 MB |
| PDFs | 2 | ~3.5 MB |
| Videos | 1 | ~50 MB |
| **TOTAL** | **19** | **~66.5 MB** |

### Files to Download (Identified)

**Images:**
- Screenshot 2026-05-09 a... (~500KB)
- Screenshot 2024-03-26 a... (~600KB) [×5]
- Screenshot 2023-03-09 a... (~600KB)
- WhatsApp Image 2023-0... (~800KB) [×2]
- instapet.png (~1.2MB)
- 2023-03-09 12.05.39.jpg (~2MB)
- Screen Shot 2022-05-10... (~800KB)

**Videos:**
- IMG_0800.MOV (~50MB)

**PDFs:**
- FTFW Flyer.pdf (~2MB)
- ZR 8-2023 Resume.pdf (~1.5MB)

---

## Best Practices for Progressive Download

### Recommended Schedule

**Week 1: Images & PDFs**
- 10-15 files per day
- Total time: ~30 minutes
- Estimated: 15 MB

**Week 2: Videos & Remaining Files**
- Download videos separately (they're larger)
- Verify file integrity
- Total time: ~1 hour

### Tips for Success

1. **Download in Batches**
   - Download 10-20 files at a time
   - Avoid browser overload with too many simultaneous downloads

2. **Monitor Browser Resources**
   - Keep Download Manager open
   - Watch for failed downloads

3. **Organize as You Go**
   - Create folder structure while downloading
   - Label files with dates

4. **Verify Downloads**
   - Check file sizes match expectations
   - Open/preview files to confirm they're not corrupted

5. **Keep Backups**
   - Save to external hard drive after initial download
   - Consider cloud backup (Google Drive, Dropbox, etc.)

---

## Troubleshooting

### Download Fails Frequently
- Check internet connection stability
- Try downloading during off-peak hours
- Use a VPN if having access issues

### Files Are Corrupted
- Re-download the file
- Check available disk space
- Clear browser cache if necessary

### Browser Crashes During Download
- Close unnecessary tabs/extensions
- Try a different browser
- Download fewer files at once

### Can't Find Files in Wix
- Log back into Wix editor
- Go to Media → Site Files
- Search by file type if needed
- Check if files are in nested folders

---

## Automation Script Checklist

- [ ] Downloaded all images
- [ ] Downloaded all PDFs
- [ ] Downloaded all videos
- [ ] Verified file counts
- [ ] Checked file sizes
- [ ] Organized into folders
- [ ] Saved backup manifest
- [ ] Copied to external drive
- [ ] Tested file access
- [ ] Deleted temporary files

---

## Monitoring Your Download

### Using the HTML Tracker

1. **Open** `WIX_SITE_FILES_DOWNLOAD_GUIDE.html` in a browser
2. **Check boxes** as files download
3. **Add notes** for any special files
4. **Export progress** regularly as JSON backup
5. **Print checklist** for physical tracking

### Checking Progress Programmatically

```bash
# Count downloaded files (Mac/Linux)
ls -1 ~/Downloads/WIX_Backup | wc -l

# Check total size
du -sh ~/Downloads/WIX_Backup

# List all files
ls -lh ~/Downloads/WIX_Backup
```

---

## Storage Organization

### Recommended Folder Structure

```
WIX_Backup/
├── Images/
│   ├── Screenshots/
│   ├── Personal/
│   └── Other/
├── Videos/
├── PDFs/
├── Manifests/
└── README.txt
```

---

## Final Verification Checklist

- [ ] All files downloaded
- [ ] Total size matches (375 MB)
- [ ] No corrupted files
- [ ] Organized in folders
- [ ] Manifest saved
- [ ] Backup on external drive
- [ ] Second copy created
- [ ] Verified file access

---

## Support Resources

- **Wix Help Center**: https://www.wix.com/en/support
- **Wix Media Manager**: Check your account settings for more options
- **Browser Console**: Press F12 for developer tools

---

*Last Updated: July 2026*
*Backup Size: 375 MB*
*Files Identified: 19*
