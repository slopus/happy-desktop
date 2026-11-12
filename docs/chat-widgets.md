# Chat widgets

Chat-based onboarding is deferred. The `show_ui` widget catalog and
`suggest_replies` quick replies have been removed, without replacing them.
Their historical tool calls remain ordinary tool rows; they do not activate
special rendering or actions. Durable questions, permissions, media attachments,
and HTML artifacts are separate features and remain available.

If we return to UI in conversations, we are more likely to expose existing
settings widgets as separate top-level tools, similar to MCP Apps, or use
composable Card, Button, Text, and Column primitives like json-render, A2UI,
or ChatGPT's intelligent UI. Neither direction is implemented here.