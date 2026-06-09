---
date: 2026-01-30T00:00:00-00:00
draft: false
title: "How to Uninstall Fedora Asahi Linux from an M1 MacBook Pro"
---

If you’ve experimented with [Fedora Asahi Linux on Apple Silicon](https://asahilinux.org/fedora/) and want to reclaim the disk space and return to a clean macOS-only setup, this guide walks through the safe, manual removal process using the `diskutil` CLI.

⚠️ WARNING: These steps permanently delete Linux data

# 1. Boot into macOS (Set as Default OS)

If your Mac still defaults to Fedora Asahi Linux:

1. Shut down the Mac
2. Hold Power → *Loading startup options*
3. Select macOS
4. Click Always Use

# 2. Inspect APFS Containers

List all APFS containers:

```bash
diskutil apfs list
```

Example output (simplified):

```text
APFS Containers (3 found)
|
+-- Container disk1
|   ===============
|   |
|   +-> Volume disk4s1
|   |   ---------------------------------------------------
|   |   Name:           Macintosh HD (Case-insensitive)
|   +-> Volume disk4s3
|   |   ---------------------------------------------------
|   |   Name:           Recovery (Case-insensitive)
|   +-> Volume disk4s5
|       ---------------------------------------------------
|       Name:           Macintosh HD - Data (Case-insensitive)
|
+-- Container disk2
    ===============
    |
    +-> Volume disk2s1
    |   ---------------------------------------------------
    |   Name:           Fedora-Root
    +-> Volume disk2s3
    |   ---------------------------------------------------
    |   Name:           Fedora-Home
    +-> Volume disk2s5
        ---------------------------------------------------
        Name:           Fedora-Swap
```

Take note of the APFS Container disk ID used by Fedora (e.g. `disk2` in the example above)

# 3. Delete the Fedora APFS Container

Unmount the entire container:

```bash
sudo diskutil apfs unmountContainer disk2
```

If it refuses:

```bash
sudo diskutil unmountDisk force disk2
```

Once unmounted, delete the container:

```bash
sudo diskutil apfs deleteContainer disk2
```

# 4. Reclaim the Space for macOS

Re-run:

```bash
diskutil list
```

You should now see Free Space where Fedora lived.
If the free space is adjacent to the macOS container:

```bash
sudo diskutil apfs resizeContainer disk1 0
```

- `0` means "use all available space"


# Conclusion

Enjoy your reclaimed SSD space!!!! 🚀
