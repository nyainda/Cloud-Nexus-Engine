---
name: jsPDF watermark transparency
description: Keep vector outlines and fills equally faint in jsPDF watermarks
---

When applying a jsPDF `GState` to a watermark, set both `opacity` and `stroke-opacity`. `opacity` maps to the PDF fill alpha (`/ca`); stroke alpha (`/CA`) is separate, so circles and linework stay opaque if only fill opacity is set. Keep logo, arcs, badge, date, and reference discernible as a light background mark; a uniformly tiny alpha makes fine stamp detail disappear.

**Why:** A stamp includes vector rings and stars as well as text and a logo image. Leaving stroke opacity untouched makes only the outlines dominate the underlying document, even when the watermark looks transparent in code.

**How to apply:** Use the same value for both GState parameters; prefer softened vector colors and a translucent logo over a very low global alpha. Render a representative PDF page and inspect detail visibility against body text.
