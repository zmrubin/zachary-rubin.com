# Wix Site Files Download - Quick Start Guide

## You Have 3 Tools to Choose From

### ✅ Option 1: Interactive HTML Tracker (Easiest - No coding required)
**File:** `WIX_SITE_FILES_DOWNLOAD_GUIDE.html`

1. Open the file in your web browser
2. Download files manually from Wix (right-click → Download)
3. Check the boxes as you download each file
4. Progress is saved automatically in your browser

**Best for:** Manual tracking, visual progress, cross-device sync

---

### ✅ Option 2: Python Script (Recommended - Most features)
**File:** `wix_auto_downloader.py`

#### Setup (One-time):
```bash
# Make it executable (Mac/Linux)
chmod +x wix_auto_downloader.py

# Or just run it directly
python3 wix_auto_downloader.py
```

#### Features:
- 📋 Interactive tracking (mark files as downloaded)
- 📊 Progress reports
- 📝 Step-by-step download instructions
- 💾 Automatic manifest generation
- 📁 Auto-organized folders (Images/, Videos/, PDFs/)

#### Menu Options:
```
1. Interactive Tracker - Mark files as you download them
2. View Instructions  - See step-by-step guide
3. View Progress      - Check download status
4. View Checklist     - See all files
5. Mark All Complete  - Quick complete option
6. Exit              - Quit program
```

---

### ✅ Option 3: Detailed Markdown Guide (Reference)
**File:** `WIX_DOWNLOAD_AUTOMATION_GUIDE.md`

Complete reference with:
- Multiple download methods
- Browser console automation
- Shell script examples
- Python API examples
- Troubleshooting guide

---

## Recommended Workflow

### For First-Time Backup:

**Phase 1: Download Images** (30 min)
1. Open Wix editor → Media → Site Files
2. Use HTML tracker or Python script to track progress
3. Right-click files 1-11 (all images)
4. Save to `Images/` folder as you go

**Phase 2: Download PDFs** (10 min)
1. Right-click files 12-13 (PDFs)
2. Save to `PDFs/` folder

**Phase 3: Download Videos** (15 min)
1. Right-click file 14 (IMG_0800.MOV)
2. Save to `Videos/` folder
3. Monitor download progress (it's 50MB)

**Phase 4: Verify & Backup** (10 min)
1. Check download manifest
2. Copy to external drive or cloud
3. Verify all files downloaded correctly

---

## Quick Reference: File List

| # | Name | Type | Size |
|---|------|------|------|
| 1 | Screenshot 2026-05-09 | image | ~500KB |
| 2 | Screenshot 2024-03-26 a | image | ~600KB |
| 3 | IMG_0800.MOV | video | ~50MB |
| 4 | FTFW Flyer.pdf | pdf | ~2MB |
| 5-9 | Screenshot 2024-03-26 (b-f) | image | ~600KB each |
| 10 | ZR 8-2023 Resume.pdf | pdf | ~1.5MB |
| 11 | Screenshot 2023-03-09 | image | ~600KB |
| 12-13 | WhatsApp Image 2023 | image | ~800KB each |
| 14 | instapet.png | image | ~1.2MB |
| 15 | 2023-03-09 12.05.39.jpg | image | ~2MB |
| 16 | Screen Shot 2022-05-10 | image | ~800KB |

**Total:** 16 files, ~66.5 MB (375 MB available on your Wix account)

---

## Step-by-Step: Using the Python Script

### Step 1: Start the Script
```bash
python3 wix_auto_downloader.py
```

### Step 2: Choose Mode
- Select option `1` for Interactive Tracker

### Step 3: Download Files from Wix
1. Go to Wix Editor → Media → Site Files
2. Right-click a file → Download
3. Wait for file to download

### Step 4: Mark in Script
When you finish downloading a file, in the script type:
```
mark <number>
```

For example:
- `mark 1` - Mark first file as downloaded
- `mark 3` - Mark third file as downloaded
- `mark 10` - Mark tenth file as downloaded

### Step 5: Check Progress
Type `progress` to see your download status

### Step 6: Finish
Type `quit` when done. Script generates final report.

---

## Using the HTML Tracker

### To Open:
1. Navigate to the folder containing the HTML file
2. Double-click `WIX_SITE_FILES_DOWNLOAD_GUIDE.html`
3. It opens in your default browser

### To Use:
1. Go to Wix → Download a file
2. In the HTML page, check the checkbox for that file
3. Optionally add notes
4. Progress saves automatically

### To Export Progress:
- Click "Export Progress" button
- Saves a JSON file with your current status
- Can import into another device if needed

---

## Tips for Success

### ✓ Download Efficiently
- Download images first (smaller files)
- Then PDFs
- Then videos last (largest files)
- Download 3-5 files at a time to avoid browser freezes

### ✓ Stay Organized
- Create folders: `Images/`, `Videos/`, `PDFs/`
- Move downloaded files into appropriate folders as you go
- Use descriptive names

### ✓ Verify Downloads
- Open/preview some files after downloading
- Check total downloaded size (~66.5 MB for all files)
- Ensure no corrupted files

### ✓ Backup Your Backup
- After all downloads complete
- Copy entire folder to external drive
- Or upload to cloud storage (Google Drive, Dropbox, etc.)

---

## Troubleshooting

### Q: Files aren't downloading
**A:** Check if pop-ups are blocked in your browser. Allow Wix to download files.

### Q: Download keeps failing for video
**A:** The 50MB file might timeout. Try in a smaller window or different browser.

### Q: Lost my progress
**A:** 
- HTML tracker: Clear browser cache or try different browser
- Python script: Progress saved in manifest.json automatically

### Q: Need to track multiple machines
**A:** Export progress from Python script, share manifest.json file

---

## After Download Complete

1. **Verify:** Count files in each folder
2. **Backup:** Copy to external drive
3. **Cloud:** Upload to Google Drive, Dropbox, etc.
4. **Document:** Keep manifest.json as record

---

## Files Created For You

```
/Your Working Folder/
├── WIX_SITE_FILES_DOWNLOAD_GUIDE.html
│   └── Interactive tracker (open in browser)
├── wix_auto_downloader.py
│   └── Python script (run: python3 wix_auto_downloader.py)
├── WIX_DOWNLOAD_AUTOMATION_GUIDE.md
│   └── Detailed reference guide
└── DOWNLOAD_QUICK_START.md
    └── This file!
```

---

## Questions?

See the detailed guide: `WIX_DOWNLOAD_AUTOMATION_GUIDE.md`

---

**Last Updated:** July 2026
**Total Files to Download:** 16
**Total Size:** ~66.5 MB
**Estimated Time:** 60-90 minutes
