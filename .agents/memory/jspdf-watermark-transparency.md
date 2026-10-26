---
name: jsPDF watermark transparency
description: Keep vector outlines and fills equally faint in jsPDF watermarks
---

When applying a jsPDF `GState` to a watermark, set both `opacity` and `stroke-opacity`. `opacity` maps to the PDF fill alpha (`/ca`); stroke alpha (`/CA`) is separate, so circles and linework stay opaque if only fill opacity is set.

**Why:** A stamp includes vector rings and stars as well as text and a logo image. Leaving stroke opacity untouched makes only the outlines dominate the underlying document, even when the watermark looks transparent in code.

**How to apply:** Use the same low value for both GState parameters, then render a representative PDF page and inspect the watermark against body text before finalizing the opacity.
