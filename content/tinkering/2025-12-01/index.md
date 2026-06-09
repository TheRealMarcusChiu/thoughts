---
date: 2025-12-01T00:00:00-00:00
draft: false
title: "How to Enable IOMMU on ASROCK ROMED8-2T"
---

You will have to enable it in both:

- BIOS
- GRUB


# Enable in BIOS

IOMMU is under `Advanced` > `AMD CBS` > `NBIO Common Options`.

# Enable in GRUB

```shell
vim /etc/default/grub
```

You will see the line with `GRUB_CMDLINE_LINUX_DEFAULT="quiet"`,
all you need to do is add `intel_iommu=on` or `amd_iommu=on` depending on your system.

```shell
# Should look like this
GRUB_CMDLINE_LINUX_DEFAULT="quiet intel_iommu=on"
```

Update grub and reboot system

```shell
update-grub
shutdown -r now
```

Now check to make sure everything is enabled.

```shell
dmesg | grep -e DMAR -e IOMMU
dmesg | grep 'remapping'
```

Should look something like the following

```shell
root@pve1:~# dmesg | grep -e DMAR -e IOMMU
[    0.550475] pci 0000:c0:00.2: AMD-Vi: IOMMU performance counters supported
[    0.553245] pci 0000:80:00.2: AMD-Vi: IOMMU performance counters supported
[    0.556894] pci 0000:40:00.2: AMD-Vi: IOMMU performance counters supported
[    0.561552] pci 0000:00:00.2: AMD-Vi: IOMMU performance counters supported
[    0.568226] perf/amd_iommu: Detected AMD IOMMU #0 (2 banks, 4 counters/bank).
[    0.568231] perf/amd_iommu: Detected AMD IOMMU #1 (2 banks, 4 counters/bank).
[    0.568238] perf/amd_iommu: Detected AMD IOMMU #2 (2 banks, 4 counters/bank).
[    0.568243] perf/amd_iommu: Detected AMD IOMMU #3 (2 banks, 4 counters/bank).
root@pve1:~# dmesg | grep 'remapping'
[    0.566174] AMD-Vi: Interrupt remapping enabled
root@pve1:~#
```
