# GitHub Copilot Pull Request Review & Implementation Rules

## Implementation Rules
- **禁止修改 PR 描述**：在执行用户指令（如 "implement all suggestions" 或 "apply changes"）时，严禁修改、覆盖或更新 Pull Request 的第一条评论（即 PR Description/Initial Comment）。
- **禁止使用工具更新 Body**：禁止调用任何用于更新 `pull_request.body` 的 API 或工具，除非用户明确要求修改描述。

## Communication Rules
- **新评论反馈**：在完成代码建议的实施后，必须**新建一条独立的评论 (New Comment)** 来展示：
    1. **实施过程**：列出你具体修改了哪些文件或逻辑。
    2. **更改总结**：简要说明本次实施对 PR 带来的影响。
- **保持原状**：无论代码如何变动，始终保持 PR 的初始背景信息、测试计划等原始描述不被触动。

## Tone and Format
- 所有的反馈总结应以 Markdown 格式发布在新的评论中，确保可读性。
