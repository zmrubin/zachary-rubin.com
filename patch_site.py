#!/usr/bin/env python3
"""
patch_site.py - Comprehensive Site Asset Patcher for zachary-rubin.com

This script:
1. Maps files from 'site files - 822a24da-7e89-486f-b4f2-9a6e08a0f105' to their corresponding
   Wix IDs (b87ec3_..., ugd/...) by scanning HTML wix-warmup-data and links.
2. Copies all 78 site files into _assets/media, _assets/docs, ugd, and _files/ugd under both
   their original upload names, their Wix IDs, and MD5-hashed names so any reference resolves locally.
3. Patches HTML, JS, and CSS files to replace remaining external Wix CDN references and ugd/ document
   links with local relative asset paths.
"""

import os
import re
import json
import shutil
import hashlib
from pathlib import Path

ROOT_DIR = os.path.abspath(os.path.dirname(__file__))
SITE_FILES_DIR = os.path.join(ROOT_DIR, "site files - 822a24da-7e89-486f-b4f2-9a6e08a0f105")

ASSETS_MEDIA = os.path.join(ROOT_DIR, "_assets", "media")
ASSETS_DOCS = os.path.join(ROOT_DIR, "_assets", "docs")
UGD_DIR = os.path.join(ROOT_DIR, "ugd")
FILES_UGD_DIR = os.path.join(ROOT_DIR, "_files", "ugd")

for d in [ASSETS_MEDIA, ASSETS_DOCS, UGD_DIR, FILES_UGD_DIR]:
    os.makedirs(d, exist_ok=True)

def md5_hash(s):
    return hashlib.md5(s.encode('utf-8')).hexdigest()[:10]

def get_rel_prefix(file_path):
    rel = os.path.relpath(ROOT_DIR, os.path.dirname(file_path))
    return rel if rel != "." else "."

def build_wix_mapping():
    """Scan all HTML files to build mapping between original filenames and Wix IDs."""
    html_files = [f for f in Path(ROOT_DIR).rglob("*.html") if "WIX_" not in f.name and "site files" not in str(f)]
    filename_to_wix = {}
    
    for hf in html_files:
        content = hf.read_text(encoding="utf-8", errors="ignore")
        match = re.search(r'<script type="application/json" id="wix-warmup-data">(.*?)</script>', content, re.DOTALL)
        if not match:
            continue
        try:
            data = json.loads(match.group(1))
            apps = data.get("appsWarmupData", {})
            for app_id, app_data in apps.items():
                for key, val in app_data.items():
                    if isinstance(val, dict) and "items" in val:
                        for item in val["items"]:
                            meta = item.get("metaData", {})
                            fn = meta.get("fileName", "")
                            name = meta.get("name", "")
                            doc_id = ""
                            link = meta.get("link", {})
                            if isinstance(link, dict) and "data" in link:
                                doc_id = link["data"].get("docId", "")
                            if fn:
                                lfn = fn.lower()
                                if lfn not in filename_to_wix:
                                    filename_to_wix[lfn] = set()
                                if name:
                                    filename_to_wix[lfn].add(name)
                                if doc_id:
                                    filename_to_wix[lfn].add(doc_id)
        except Exception as e:
            pass
    return filename_to_wix

def copy_asset_variants(src_path, filename, wix_ids):
    """Copy asset to target directories under original name, wix_ids, and hashed names."""
    copied_paths = set()
    ext = os.path.splitext(filename)[1].lower()
    
    # 1. Copy original filename to _assets/media
    target_media = os.path.join(ASSETS_MEDIA, filename)
    shutil.copy2(src_path, target_media)
    copied_paths.add(target_media)
    
    # If PDF, copy to docs and ugd directories
    if ext == ".pdf":
        for target_dir in [ASSETS_DOCS, UGD_DIR, FILES_UGD_DIR]:
            t_path = os.path.join(target_dir, filename)
            shutil.copy2(src_path, t_path)
            copied_paths.add(t_path)
            
    # 2. Copy for each mapped Wix ID
    for wid in wix_ids:
        # wid could be like 'b87ec3_xxx~mv2.jpg' or 'ugd/b87ec3_xxx.pdf'
        clean_wid = wid.split("/")[-1]
        
        # Copy exact wix name
        t_wix_exact = os.path.join(ASSETS_MEDIA, clean_wid)
        shutil.copy2(src_path, t_wix_exact)
        copied_paths.add(t_wix_exact)
        
        # Copy with tilde replaced by underscore
        clean_wid_under = clean_wid.replace("~", "_")
        t_wix_under = os.path.join(ASSETS_MEDIA, clean_wid_under)
        shutil.copy2(src_path, t_wix_under)
        copied_paths.add(t_wix_under)
        
        # Copy MD5 hashed version: <hash>_<basename>
        # Match archive_zachary_rubin.py naming convention
        h = md5_hash(wid)
        base_clean = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', clean_wid)
        if not base_clean.endswith(ext):
            base_clean = f"{base_clean}_{h}{ext}"
        else:
            base_clean = f"{h}_{base_clean}"
        t_wix_hashed = os.path.join(ASSETS_MEDIA, base_clean)
        shutil.copy2(src_path, t_wix_hashed)
        copied_paths.add(t_wix_hashed)
        
        # If it's a docId (starts with ugd/ or ends with .pdf), copy into UGD dirs
        if wid.startswith("ugd/") or ext == ".pdf":
            for target_dir in [UGD_DIR, FILES_UGD_DIR, ASSETS_DOCS]:
                t_doc = os.path.join(target_dir, clean_wid)
                shutil.copy2(src_path, t_doc)
                copied_paths.add(t_doc)

    return len(copied_paths)

def patch_references():
    """Patch HTML and JS files to replace remaining Wix static CDN URLs and ugd/ links."""
    patched_files = 0
    targets = []
    for ext in ["*.html", "*.js", "*.css"]:
        for p in Path(ROOT_DIR).rglob(ext):
            if "WIX_" not in p.name and "site files" not in str(p) and "scratch" not in str(p) and ".git" not in str(p):
                targets.append(p)
                
    for p in targets:
        try:
            old_content = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
            
        new_content = old_content
        rel_prefix = get_rel_prefix(str(p))
        media_rel = f"{rel_prefix}/_assets/media" if rel_prefix != "." else "./_assets/media"
        ugd_rel = f"{rel_prefix}/ugd" if rel_prefix != "." else "./ugd"
        
        # Replace mediaRootUrl and staticMediaUrl in JSON warmup/viewer models
        new_content = re.sub(
            r'"mediaRootUrl":"https:\\/\\/static\.wixstatic\.com"',
            f'"mediaRootUrl":"{media_rel}"',
            new_content
        )
        new_content = re.sub(
            r'"staticMediaUrl":"https:\\/\\/static\.wixstatic\.com\\/media"',
            f'"staticMediaUrl":"{media_rel}"',
            new_content
        )
        
        # Replace direct https://static.wixstatic.com/media/ references
        new_content = re.sub(
            r'https://static\.wixstatic\.com/media/',
            f'{media_rel}/',
            new_content
        )
        new_content = re.sub(
            r'https:\\/\\/static\.wixstatic\.com\\/media\\/',
            f'{media_rel}/'.replace("/", "\\/"),
            new_content
        )
        
        # Replace external document links to ugd/
        new_content = re.sub(
            r'https://www\.zachary-rubin\.com/_files/ugd/',
            f'{ugd_rel}/',
            new_content
        )
        new_content = re.sub(
            r'https://www\.zachary-rubin\.com/ugd/',
            f'{ugd_rel}/',
            new_content
        )
        
        if new_content != old_content:
            p.write_text(new_content, encoding="utf-8")
            patched_files += 1
            
    return patched_files

def main():
    print("==============================================")
    print("  Zachary Rubin Website Asset Patcher")
    print("==============================================")
    
    if not os.path.exists(SITE_FILES_DIR):
        print(f"[ERROR] Site files directory not found: {SITE_FILES_DIR}")
        return
        
    site_files = sorted(os.listdir(SITE_FILES_DIR))
    print(f"Found {len(site_files)} files in 'site files' folder.")
    
    print("\n[Step 1] Building Wix ID mapping from HTML warmup data...")
    mapping = build_wix_mapping()
    print(f"Mapped {len(mapping)} filenames from warmup data.")
    
    print("\n[Step 2] Copying assets to _assets/media, _assets/docs, ugd, and _files/ugd...")
    total_copies = 0
    for sf in site_files:
        src_path = os.path.join(SITE_FILES_DIR, sf)
        wix_ids = mapping.get(sf.lower(), set())
        copies = copy_asset_variants(src_path, sf, wix_ids)
        total_copies += copies
    print(f"Copied 78 source assets into {total_copies} total local variant files across target folders.")
    
    print("\n[Step 3] Patching HTML, JS, and CSS files for offline local asset resolution...")
    patched_count = patch_references()
    print(f"Patched {patched_count} files with relative local asset paths.")
    
    print("\n==============================================")
    print("  Site Patch Completed Successfully!")
    print("==============================================")

if __name__ == "__main__":
    main()
