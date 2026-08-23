<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:ui-agent-rules -->
# UI work: use the shadcn skill

Whenever fixing anything that affects the UI, load the `shadcn` skill and use it as context (styling rules, component composition, project config from `npx shadcn@latest info`). This app uses base-nova style with `base` primitives and Tailwind v4.
<!-- END:ui-agent-rules -->
