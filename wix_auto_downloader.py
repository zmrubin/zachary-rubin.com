#!/usr/bin/env python3
"""
Wix Site Files Auto-Downloader
Automates progressive download of all files from Wix Site Files with progress tracking
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
import hashlib

@dataclass
class FileRecord:
    """Track individual file download status"""
    name: str
    file_type: str
    size: str
    status: str = "pending"  # pending, downloading, completed, failed
    downloaded_time: str = ""
    file_hash: str = ""
    notes: str = ""

class WixAutoDownloader:
    """Automated downloader and progress tracker for Wix Site Files"""

    def __init__(self, download_dir=None):
        """Initialize downloader with specified directory"""
        if download_dir is None:
            download_dir = Path.home() / "Downloads" / "WIX_Backup"
        else:
            download_dir = Path(download_dir)

        self.download_dir = download_dir
        self.download_dir.mkdir(parents=True, exist_ok=True)

        # Organize into subfolders
        self.image_dir = self.download_dir / "Images"
        self.video_dir = self.download_dir / "Videos"
        self.pdf_dir = self.download_dir / "PDFs"
        self.other_dir = self.download_dir / "Other"

        for d in [self.image_dir, self.video_dir, self.pdf_dir, self.other_dir]:
            d.mkdir(exist_ok=True)

        # Initialize file list
        self.files = self._init_file_list()

        # Load existing progress
        self.manifest_path = self.download_dir / "manifest.json"
        self.progress = self._load_progress()

        print(f"📁 Download directory: {self.download_dir}")
        print(f"📊 Total files: {len(self.files)}")
        print(f"✓ Already downloaded: {self._count_completed()}")

    def _init_file_list(self):
        """Initialize list of files to download"""
        return [
            FileRecord("Screenshot 2026-05-09", "image", "~500KB"),
            FileRecord("Screenshot 2024-03-26 a", "image", "~600KB"),
            FileRecord("IMG_0800.MOV", "video", "~50MB"),
            FileRecord("FTFW Flyer.pdf", "pdf", "~2MB"),
            FileRecord("Screenshot 2024-03-26 b", "image", "~600KB"),
            FileRecord("Screenshot 2024-03-26 c", "image", "~600KB"),
            FileRecord("Screenshot 2024-03-26 d", "image", "~600KB"),
            FileRecord("Screenshot 2024-03-26 e", "image", "~600KB"),
            FileRecord("Screenshot 2024-03-26 f", "image", "~600KB"),
            FileRecord("ZR 8-2023 Resume.pdf", "pdf", "~1.5MB"),
            FileRecord("Screenshot 2023-03-09", "image", "~600KB"),
            FileRecord("WhatsApp Image 2023-01", "image", "~800KB"),
            FileRecord("WhatsApp Image 2023-02", "image", "~800KB"),
            FileRecord("instapet.png", "image", "~1.2MB"),
            FileRecord("2023-03-09 12.05.39.jpg", "image", "~2MB"),
            FileRecord("Screen Shot 2022-05-10", "image", "~800KB"),
        ]

    def _load_progress(self):
        """Load existing progress from manifest"""
        if self.manifest_path.exists():
            with open(self.manifest_path, 'r') as f:
                return json.load(f)
        return {
            "created": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "total_files": len(self.files),
            "completed": 0,
            "failed": 0,
            "files": []
        }

    def _count_completed(self):
        """Count completed downloads"""
        return sum(1 for f in self.files if f.status == "completed")

    def _get_target_dir(self, file_type):
        """Get target directory based on file type"""
        dirs = {
            "image": self.image_dir,
            "video": self.video_dir,
            "pdf": self.pdf_dir,
            "other": self.other_dir
        }
        return dirs.get(file_type, self.other_dir)

    def mark_file_completed(self, file_name):
        """Mark a file as downloaded"""
        for f in self.files:
            if f.name == file_name:
                f.status = "completed"
                f.downloaded_time = datetime.now().isoformat()
                self.progress["completed"] += 1
                self.progress["last_updated"] = datetime.now().isoformat()
                self._save_progress()
                return True
        return False

    def mark_file_failed(self, file_name, error=""):
        """Mark a file as failed"""
        for f in self.files:
            if f.name == file_name:
                f.status = "failed"
                f.notes = error
                self.progress["failed"] += 1
                self.progress["last_updated"] = datetime.now().isoformat()
                self._save_progress()
                return True
        return False

    def _save_progress(self):
        """Save progress to manifest"""
        with open(self.manifest_path, 'w') as f:
            json.dump(self.progress, f, indent=2)

    def print_progress_report(self):
        """Print formatted progress report"""
        total = len(self.files)
        completed = self._count_completed()
        failed = sum(1 for f in self.files if f.status == "failed")
        pending = total - completed - failed

        print("\n" + "="*70)
        print("DOWNLOAD PROGRESS REPORT")
        print("="*70)
        print(f"📊 Total Files:        {total}")
        print(f"✓ Downloaded:          {completed} ({completed/total*100:.1f}%)")
        print(f"⏳ Pending:             {pending}")
        print(f"✗ Failed:              {failed}")
        print(f"📁 Location:           {self.download_dir}")
        print("="*70)

        # Show file breakdown
        image_count = sum(1 for f in self.files if f.file_type == "image")
        video_count = sum(1 for f in self.files if f.file_type == "video")
        pdf_count = sum(1 for f in self.files if f.file_type == "pdf")

        print("\n📋 FILE BREAKDOWN:")
        print(f"  🖼️  Images:  {image_count} files")
        print(f"  🎬 Videos:  {video_count} files")
        print(f"  📄 PDFs:    {pdf_count} files")

        # Show pending files
        pending_files = [f for f in self.files if f.status == "pending"]
        if pending_files:
            print("\n⏳ PENDING FILES (Next to download):")
            for i, f in enumerate(pending_files[:5], 1):
                print(f"  {i}. {f.name} ({f.file_type.upper()}) - {f.size}")
            if len(pending_files) > 5:
                print(f"  ... and {len(pending_files)-5} more")

    def print_checklist(self):
        """Print interactive checklist"""
        print("\n" + "="*70)
        print("INTERACTIVE DOWNLOAD CHECKLIST")
        print("="*70)

        for i, f in enumerate(self.files, 1):
            status_icon = "✓" if f.status == "completed" else "✗" if f.status == "failed" else "⏳"
            print(f"[{status_icon}] {i:2d}. {f.name:40} ({f.file_type.upper():5}) {f.size:8}")

    def interactive_tracker(self):
        """Interactive mode for manual downloads"""
        print("\n" + "="*70)
        print("INTERACTIVE DOWNLOAD TRACKER")
        print("="*70)
        print("\nCommands:")
        print("  'mark <number>' - Mark file as downloaded")
        print("  'mark-all'      - Mark all as downloaded")
        print("  'reset <number>'- Mark file as pending")
        print("  'show'          - Show checklist")
        print("  'progress'      - Show progress report")
        print("  'quit'          - Exit tracker")
        print("\nExample: 'mark 3' to mark file #3 as downloaded\n")

        while True:
            try:
                cmd = input(">>> ").strip().lower()

                if cmd == "quit":
                    self.print_progress_report()
                    break
                elif cmd == "show":
                    self.print_checklist()
                elif cmd == "progress":
                    self.print_progress_report()
                elif cmd == "mark-all":
                    for f in self.files:
                        f.status = "completed"
                        f.downloaded_time = datetime.now().isoformat()
                    self.progress["completed"] = len(self.files)
                    self.progress["last_updated"] = datetime.now().isoformat()
                    self._save_progress()
                    print("✓ All files marked as downloaded!")
                    self.print_progress_report()
                elif cmd.startswith("mark "):
                    try:
                        num = int(cmd.split()[1]) - 1
                        if 0 <= num < len(self.files):
                            self.files[num].status = "completed"
                            self.files[num].downloaded_time = datetime.now().isoformat()
                            self.progress["completed"] += 1
                            self.progress["last_updated"] = datetime.now().isoformat()
                            self._save_progress()
                            print(f"✓ Marked: {self.files[num].name}")
                        else:
                            print("❌ Invalid file number")
                    except (ValueError, IndexError):
                        print("❌ Invalid format. Use: mark <number>")
                elif cmd.startswith("reset "):
                    try:
                        num = int(cmd.split()[1]) - 1
                        if 0 <= num < len(self.files):
                            if self.files[num].status == "completed":
                                self.progress["completed"] -= 1
                            self.files[num].status = "pending"
                            self.files[num].downloaded_time = ""
                            self.progress["last_updated"] = datetime.now().isoformat()
                            self._save_progress()
                            print(f"⏳ Reset: {self.files[num].name}")
                        else:
                            print("❌ Invalid file number")
                    except (ValueError, IndexError):
                        print("❌ Invalid format. Use: reset <number>")
                else:
                    print("❌ Unknown command")

            except KeyboardInterrupt:
                print("\n\nGoodbye! 👋")
                break
            except Exception as e:
                print(f"Error: {e}")

    def generate_download_instructions(self):
        """Generate step-by-step download instructions"""
        output = "STEP-BY-STEP DOWNLOAD INSTRUCTIONS\n"
        output += "="*70 + "\n\n"

        # Group by type
        images = [f for f in self.files if f.file_type == "image"]
        videos = [f for f in self.files if f.file_type == "video"]
        pdfs = [f for f in self.files if f.file_type == "pdf"]

        output += "🖼️  IMAGES (Recommended: Download first)\n"
        output += "-"*70 + "\n"
        for i, f in enumerate(images, 1):
            output += f"{i:2d}. Right-click: {f.name} → Download → Save to 'Images' folder\n"

        output += "\n📄 PDFs (Recommended: Download second)\n"
        output += "-"*70 + "\n"
        for i, f in enumerate(pdfs, 1):
            output += f"{i:2d}. Right-click: {f.name} → Download → Save to 'PDFs' folder\n"

        output += "\n🎬 VIDEOS (Recommended: Download last - large files)\n"
        output += "-"*70 + "\n"
        for i, f in enumerate(videos, 1):
            output += f"{i:2d}. Right-click: {f.name} → Download → Save to 'Videos' folder\n"

        return output

    def create_manifest_json(self):
        """Create detailed manifest of all files"""
        manifest = {
            "project": "Wix Site Files Backup",
            "timestamp": datetime.now().isoformat(),
            "backup_location": str(self.download_dir),
            "total_files": len(self.files),
            "files": [asdict(f) for f in self.files],
            "summary": {
                "images": len([f for f in self.files if f.file_type == "image"]),
                "videos": len([f for f in self.files if f.file_type == "video"]),
                "pdfs": len([f for f in self.files if f.file_type == "pdf"]),
                "completed": self._count_completed(),
                "pending": len([f for f in self.files if f.status == "pending"]),
                "failed": len([f for f in self.files if f.status == "failed"])
            }
        }

        with open(self.manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)

        return manifest

def main():
    """Main entry point"""
    print("\n" + "="*70)
    print("WIX SITE FILES AUTO-DOWNLOADER")
    print("="*70)

    # Initialize downloader
    downloader = WixAutoDownloader()

    # Show menu
    print("\nSelect mode:")
    print("1. Interactive Tracker (manual - track downloads as you go)")
    print("2. View Instructions (step-by-step guide)")
    print("3. View Progress (check current status)")
    print("4. View Checklist (all files)")
    print("5. Mark All Complete (for testing)")
    print("6. Exit")

    while True:
        choice = input("\nEnter choice (1-6): ").strip()

        if choice == "1":
            downloader.interactive_tracker()
        elif choice == "2":
            print("\n" + downloader.generate_download_instructions())
        elif choice == "3":
            downloader.print_progress_report()
        elif choice == "4":
            downloader.print_checklist()
        elif choice == "5":
            downloader.interactive_tracker()  # Will go into interactive mode
        elif choice == "6":
            print("\nGoodbye! 👋")
            break
        else:
            print("Invalid choice. Please try again.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nDownload manager closed.")
    except Exception as e:
        print(f"\nError: {e}")
