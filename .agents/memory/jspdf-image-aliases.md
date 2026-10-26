---
name: jsPDF image aliases
description: Avoid silent logo substitution when a PDF embeds more than one image.
---

Never reuse a fixed jsPDF image alias for different image data in one document. jsPDF can reuse the first embedded image for later calls with that alias, silently putting the wrong shop logo in a PDF.

**Why:** A visual proof with GreenLink and Kabatha Sunrise stamps showed the Sunrise seal using GreenLink's image when both addImage calls shared one alias.

**How to apply:** Omit the alias when adding distinct logos, or derive a unique alias from each image's identity.
